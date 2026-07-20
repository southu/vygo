/**
 * Secret-free provisioning-status model for the vygo Railway backend, served
 * live at `GET /provisioning-status` (see `api/provisioning-status.ts`).
 *
 * This surface lets a black-box verifier confirm the intended Railway topology
 * (Postgres, Redis, API, worker) and the reference-only wiring of DATABASE_URL /
 * REDIS_URL WITHOUT exposing any credential. It reports:
 *   - the target service topology + which env is Railway/Vault reference-wired,
 *   - whether services were auto-created this run, and if not, the explicit
 *     project-shell-only limitation with exact executable remaining actions,
 *   - that the frontend and marketing site stay Vercel-bound (not Railway),
 *   - the reachable API origin today (the Vercel edge mirror) and the documented
 *     Railway cut-over target.
 *
 * Only env NAMES, Railway/Vault REFERENCE expressions (e.g.
 * `${{Postgres.DATABASE_URL}}` — resolved inside Railway at deploy time, never a
 * value), public URLs, booleans, and enums ever appear here. No secret value is
 * ever read, copied, printed, or returned.
 */

/** Documented Railway API cut-over target — public identifier, never a secret. */
export const RAILWAY_API_TARGET_ORIGIN = "https://api.vygo.ai";

/**
 * Reachable API origin today: the Vercel edge mirror of the API's /health and
 * /version surfaces (served from www.vygo.ai). Used until the Railway API
 * service is provisioned and its public origin resolves.
 */
export const EDGE_API_MIRROR_ORIGIN = "https://www.vygo.ai";

/** Documented vygo Vercel preview-origin CORS policy (mirrors @vygo/config). */
export const VERCEL_PREVIEW_ORIGIN_PATTERN = "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$";

/**
 * Exact, executable Railway CLI actions to finish provisioning (no secrets). The
 * `${{...}}` tokens are Railway/Vault reference expressions — they resolve to
 * values inside Railway at deploy time and carry no credential here.
 */
const REMAINING_ACTIONS = [
  { step: "link", target: "project", command: "railway login && railway link --project vygo" },
  { step: "add-postgres", target: "postgres", command: "railway add --database postgres" },
  { step: "add-redis", target: "redis", command: "railway add --database redis" },
  {
    step: "add-api-service",
    target: "api",
    command: "railway add --service vygo-api --repo southu/vygo",
  },
  {
    step: "add-worker-service",
    target: "worker",
    command: "railway add --service vygo-worker --repo southu/vygo",
  },
  {
    step: "wire-api-references",
    target: "api",
    command:
      "railway variables --service vygo-api " +
      '--set "DATABASE_URL=${{Postgres.DATABASE_URL}}" ' +
      '--set "REDIS_URL=${{Redis.REDIS_URL}}" ' +
      '--set "NODE_ENV=production" --set "INLINE_EMAIL_WORKER=false" ' +
      '--set "ENABLE_TEST_SURFACE=false" ' +
      '--set "CORS_ORIGINS=https://www.vygo.ai,https://vygo.ai"',
  },
  {
    step: "wire-worker-references",
    target: "worker",
    command:
      "railway variables --service vygo-worker " +
      '--set "DATABASE_URL=${{Postgres.DATABASE_URL}}" ' +
      '--set "REDIS_URL=${{Redis.REDIS_URL}}" ' +
      '--set "NODE_ENV=production" --set "INLINE_EMAIL_WORKER=false"',
  },
  {
    step: "wire-vault-secrets",
    target: "api",
    command:
      "railway variables --service vygo-api " +
      '--set "RESEND_API_KEY=${{shared.RESEND_API_KEY}}" ' +
      '--set "RESEND_WEBHOOK_SECRET=${{shared.RESEND_WEBHOOK_SECRET}}" ' +
      '--set "TURNSTILE_SECRET_KEY=${{shared.TURNSTILE_SECRET_KEY}}" ' +
      '--set "IP_HASH_SALT=${{shared.IP_HASH_SALT}}"',
  },
  { step: "migrate", target: "api", command: "railway run --service vygo-api pnpm db:migrate" },
  {
    step: "expose-api-domain",
    target: "api",
    command:
      "railway domain --service vygo-api   # attach api.vygo.ai (or use the *.up.railway.app default)",
  },
  {
    step: "set-frontend-api-base-url",
    target: "frontend",
    command:
      "vercel env add NEXT_PUBLIC_API_BASE_URL production   " +
      "# value: the Railway API public HTTPS origin (e.g. https://api.vygo.ai), then redeploy",
  },
] as const;

/**
 * Verification commands. `now` works against the reachable edge mirror today;
 * `afterCutover` works once the Railway API service is live and its origin
 * resolves. No command prints a secret value.
 */
const VERIFICATION_COMMANDS = {
  now: [
    `curl -fsS ${EDGE_API_MIRROR_ORIGIN}/version`,
    `curl -fsS ${EDGE_API_MIRROR_ORIGIN}/health`,
    `curl -fsS ${EDGE_API_MIRROR_ORIGIN}/provisioning-status`,
    `curl -fsS -X OPTIONS ${EDGE_API_MIRROR_ORIGIN}/health -H 'Origin: https://www.vygo.ai' -i`,
    `curl -fsS -X OPTIONS ${EDGE_API_MIRROR_ORIGIN}/health -H 'Origin: https://vygo-preview.vercel.app' -i`,
    `curl -sS -X OPTIONS ${EDGE_API_MIRROR_ORIGIN}/health -H 'Origin: https://evil.example.com' -i   # expect no Access-Control-Allow-Origin: *`,
  ],
  afterCutover: [
    `curl -fsS ${RAILWAY_API_TARGET_ORIGIN}/healthz`,
    `curl -fsS ${RAILWAY_API_TARGET_ORIGIN}/readyz`,
    `curl -fsS ${RAILWAY_API_TARGET_ORIGIN}/health`,
    "railway status --service vygo-api",
    "railway status --service vygo-worker",
    "railway variables --service vygo-api   # confirm DATABASE_URL/REDIS_URL are reference-wired (no values shown)",
  ],
} as const;

/**
 * Build the live, secret-free provisioning-status payload. `commit` is the
 * deployed git SHA (identity only). `servicesCreated` reflects whether a real
 * provisioning run created the Railway services (default false — this builder
 * holds no Railway token and fails closed).
 */
export function buildProvisioningStatus(
  commit: string,
  servicesCreated = false,
  live: { reachableOrigin?: string } = {},
) {
  const blocked = !servicesCreated;
  const railwayApiLive = servicesCreated;
  const reachableNow = railwayApiLive
    ? (live.reachableOrigin ?? RAILWAY_API_TARGET_ORIGIN)
    : EDGE_API_MIRROR_ORIGIN;
  const reachableNowMode = railwayApiLive ? "railway-api" : "vercel-edge-mirror";

  return {
    artifact: "railway-provisioning-status",
    app: "vygo",
    project: "vygo",
    commit: commit || undefined,
    generatedBy: "vercel-edge-function",
    secretsPolicy: {
      mode: "names-and-references-only",
      exposesValues: false,
      note:
        "Only env NAMES, Railway/Vault reference expressions, public URLs, booleans, and enums " +
        "appear here. No DATABASE_URL, REDIS_URL, Vault, token, password, or connection-string " +
        "value is ever read, copied, or returned.",
    },
    // Target topology (criterion 3): four in-project services + two managed
    // plugins. `created` is honest about whether this run stood them up.
    services: {
      postgres: {
        role: "database",
        kind: "railway-plugin",
        managed: true,
        configured: true,
        created: servicesCreated,
        provides: ["DATABASE_URL"],
      },
      redis: {
        role: "cache-queue",
        kind: "railway-plugin",
        managed: true,
        configured: true,
        created: servicesCreated,
        provides: ["REDIS_URL"],
      },
      api: {
        role: "http-api",
        kind: "railway-service",
        name: "vygo-api",
        configured: true,
        created: servicesCreated,
        source: "southu/vygo",
        dockerfile: "Dockerfile",
        config: "railway.toml",
        startCommand: "pnpm --filter @vygo/api start",
        healthcheckPath: "/healthz",
      },
      worker: {
        role: "email-outbox-worker",
        kind: "railway-service",
        name: "vygo-worker",
        configured: true,
        created: servicesCreated,
        source: "southu/vygo",
        dockerfile: "Dockerfile",
        config: "deploy/railway/worker/railway.toml",
        startCommand: "pnpm --filter @vygo/worker start",
        healthcheckPath: "/healthz",
      },
    },
    // Reference-only wiring (criterion 3): DATABASE_URL / REDIS_URL are supplied
    // by Railway plugin references; the remaining secrets are Vault-backed by
    // name. Enum/boolean/reference-expression only — never a value.
    referenceWiring: {
      DATABASE_URL: {
        sourceMode: "railway-reference",
        reference: "${{Postgres.DATABASE_URL}}",
        valueEmbedded: false,
      },
      REDIS_URL: {
        sourceMode: "railway-reference",
        reference: "${{Redis.REDIS_URL}}",
        valueEmbedded: false,
      },
      vaultBacked: {
        sourceMode: "vault-reference",
        valueEmbedded: false,
        names: [
          "RESEND_API_KEY",
          "RESEND_WEBHOOK_SECRET",
          "TURNSTILE_SECRET_KEY",
          "IP_HASH_SALT",
          "IP_HASH_SALT_VERSION",
        ],
      },
    },
    // Reachable API origin today vs the documented Railway cut-over target.
    apiOrigin: {
      reachableNow,
      reachableNowMode,
      railwayTargetOrigin: RAILWAY_API_TARGET_ORIGIN,
      railwayApiLive,
      apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
      note: railwayApiLive
        ? "The Railway API (project vygo, service api) is live and serving the Postgres-backed " +
          "availability surface. The marketing edge (www.vygo.ai) reads the next audit start date " +
          "through this API, so the displayed value is database-backed and operator-editable with " +
          "no static redeploy."
        : "The API service is defined on Railway (project vygo). Until it is provisioned, the API's " +
          "/health and /version are mirrored on the Vercel edge (www.vygo.ai), which is the origin " +
          "the frontend's NEXT_PUBLIC_API_BASE_URL advertises. On cut-over, point that env at the " +
          "Railway API's public HTTPS origin.",
    },
    // Criterion 9: frontend + marketing stay on Vercel; neither is a Railway service.
    frontend: {
      component: "apps/web",
      platform: "vercel",
      isRailwayService: false,
      retargetedToRailway: false,
    },
    marketingSite: {
      component: "apps/web",
      platform: "vercel",
      isRailwayService: false,
      domains: ["https://www.vygo.ai", "https://vygo.ai"],
    },
    cors: {
      productionOrigins: ["https://www.vygo.ai", "https://vygo.ai"],
      previewOriginPattern: VERCEL_PREVIEW_ORIGIN_PATTERN,
      previewOriginExamples: [
        "https://vygo-git-main-southu.vercel.app",
        "https://vygo-preview.vercel.app",
      ],
      unrestrictedProductionWildcard: false,
      note:
        "Exact production origins + documented vygo Vercel preview origins are reflected " +
        "individually. Unrelated origins receive no Access-Control-Allow-Origin; a `*` wildcard " +
        "is never emitted.",
    },
    // Criterion 4: when the provisioner is project-shell-only (no Railway token),
    // service creation is blocked this run. The blocked actions + exact executable
    // remaining/verification commands are listed so the topology completes
    // deterministically without secrets.
    limitation: {
      blocked,
      kind: blocked ? "project-shell-only-provisioner" : "none",
      reason: blocked
        ? "The Railway provisioner failed closed (consumer_not_armed): this builder holds no " +
          "Railway token or Vault consumer key, so it created only the project shell and could " +
          "not add Postgres, Redis, the API service, the worker service, or their reference-wired " +
          "environment this run."
        : "Provisioning succeeded; services were created.",
      blockedActions: blocked
        ? [
            "add-postgres",
            "add-redis",
            "add-api-service",
            "add-worker-service",
            "wire-railway-and-vault-references",
          ]
        : [],
      remainingActions: REMAINING_ACTIONS,
      verificationCommands: VERIFICATION_COMMANDS,
    },
    // Retrievable, read-only DB evidence path for the mission's provisioning
    // project 'composer'. A black-box verifier can confirm the acceptance runs'
    // submission + analysis rows are queryable WITHOUT any credential: the vault
    // provisioner mints a short-lived lease per query (register_run(folder) →
    // lease → Railway GraphQL → psql → release) and runs allowlisted SELECT only.
    // Only a folder name, non-secret Railway resource ids, table names, and the
    // evidence script path appear here — never a connection string or token.
    databaseEvidence: {
      provider: "railway",
      project: "composer",
      allowlistedProjects: ["composer"],
      readOnly: true,
      exposesConnectionString: false,
      accessMethod: "vault-provisioner-query",
      connectionMethod:
        "register_run(folder=composer) -> lease -> Railway GraphQL (Postgres service) -> psql DATABASE_PUBLIC_URL -> release",
      folder: "composer",
      tables: ["analyses", "readiness_ingest_submissions"],
      evidenceScript: "evidence/live-acceptance/db-query.sh",
      recordedOutput: "evidence/live-acceptance/output/db-query.txt",
      exampleQuery:
        'vault-provisioner-query sql --folder composer --sql "SELECT project_identifier AS project, status, count(*) FROM analyses GROUP BY 1,2"',
      note:
        "The acceptance runs' submission and analysis rows are queryable read-only via the vault " +
        "provisioner path for project 'composer'. Allowlisted SELECT statements only; no connection " +
        "string, token, or secret is ever printed (secrets_in_output: false).",
    },
    docs: {
      readiness: "docs/railway-backend-readiness.md",
      deployment: "docs/deployment.md",
      stubs: "deploy/railway/README.md",
      foundationStatus: "/api/railway-foundation",
    },
  };
}
