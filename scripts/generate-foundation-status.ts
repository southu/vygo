/**
 * Generates the Railway backend foundation status artifact for project `vygo`.
 *
 * Output (static, served by Vercel):
 *   - apps/web/public/api/railway-foundation.json  → GET /api/railway-foundation
 *   - apps/web/src/generated/railway-foundation.json (committed mirror snapshot)
 *
 * Purpose: give a human (or a follow-on mission) a single, unambiguous,
 * secret-free go/no-go signal for attaching Postgres/Redis/API/worker services
 * to Railway project `vygo`.
 *
 * Invariants enforced here:
 *   - provision.outcome is exactly "success" | "failed_closed" — never an
 *     ambiguous or empty partial-success state.
 *   - "success" REQUIRES a non-secret project_id AND an https://railway dashboard
 *     URL; otherwise the outcome is normalized down to a closed failure.
 *   - "failed_closed" REQUIRES a code in { vault_locked, consumer_not_armed,
 *     vault_access_denied }.
 *   - The emitted artifact is self-scanned for credential-shaped strings; the
 *     build fails if any are found. Only env NAMES, public URLs, and null/blank
 *     values are ever written.
 *
 * A follow-on mission that actually provisions can flip this to success WITHOUT
 * code changes and WITHOUT committing secrets, via env:
 *   FOUNDATION_PROVISION_OUTCOME=success
 *   FOUNDATION_PROJECT_ID=<non-secret railway project id>
 *   FOUNDATION_DASHBOARD_URL=https://railway.app/project/<id>
 * (project_id and dashboard URL are non-secret identifiers, safe to publish.)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/**
 * Committed, NON-SECRET provisioning identity attestation (shared/provision-identity.json),
 * recorded from the approved Vault Provisioner run for project `vygo`. Carries
 * ONLY public identifiers (project_id + https://railway dashboard URL) — never a
 * token, vault consumer key, or connection string. Used to reflect the real,
 * verified provisioning success in the deployed artifact when the Vercel build
 * environment does not inject the FOUNDATION_* env (build-time env still wins).
 */
type ProvisionIdentity = {
  armed?: boolean;
  outcome?: string;
  project_id?: string;
  dashboard_url?: string;
};

/** Truthy check for a NON-SECRET boolean flag (VAULT_LOCKED only). */
function isFlagTrue(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readProvisionIdentity(): ProvisionIdentity | null {
  const abs = path.join(root, "shared/provision-identity.json");
  if (!existsSync(abs)) return null;
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8")) as ProvisionIdentity;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const CLOSED_FAILURE_CODES = ["vault_locked", "consumer_not_armed", "vault_access_denied"] as const;
type ClosedFailureCode = (typeof CLOSED_FAILURE_CODES)[number];

/** Default closed-failure code when provisioning was not run this pass. */
const DEFAULT_CLOSED_CODE: ClosedFailureCode = "consumer_not_armed";

/**
 * High-confidence credential shapes — mirror of scripts/secret-scan.ts.
 * Deliberately does NOT match bare UUIDs: a Railway project_id is a UUID and is
 * a public identifier, so flagging UUIDs would reject legitimate, non-secret ids.
 */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  {
    name: "generic-api-key-assignment",
    re: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/i,
  },
  { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "github-pat", re: /ghp_[A-Za-z0-9]{36,}/ },
  { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "stripe-live-key", re: /sk_live_[A-Za-z0-9]{20,}/ },
];

function exists(rel: string): boolean {
  return existsSync(path.join(root, rel));
}

function gitSha(): string {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "";
  if (fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv.trim())) {
    return fromEnv.trim();
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** A non-empty, non-credential-shaped Railway project id (identifiers are public). */
function normalizeProjectId(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  // Reject anything that looks like a secret/token rather than a plain id.
  if (SECRET_PATTERNS.some((p) => p.re.test(value))) return null;
  if (value.length > 128) return null;
  return value;
}

/** A public Railway dashboard URL (never a secret). */
function normalizeDashboardUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!/(^|\.)railway\.(app|com)$/.test(url.hostname)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Resolve the provision outcome from env, then NORMALIZE so the result is never
 * ambiguous: success must carry both a non-secret project_id and a dashboard
 * URL, otherwise it falls back to an explicit closed failure.
 */
function resolveProvision(): {
  outcome: "success" | "failed_closed";
  code: ClosedFailureCode | null;
  project_id: string | null;
  dashboardUrl: string | null;
  detail: string;
} {
  const requested = (process.env.FOUNDATION_PROVISION_OUTCOME ?? "").trim().toLowerCase();
  const projectId = normalizeProjectId(process.env.FOUNDATION_PROJECT_ID);
  const dashboardUrl = normalizeDashboardUrl(process.env.FOUNDATION_DASHBOARD_URL);

  if (requested === "success") {
    if (projectId && dashboardUrl) {
      return {
        outcome: "success",
        code: null,
        project_id: projectId,
        dashboardUrl,
        detail:
          "Railway project `vygo` is provisioned. project_id and dashboard URL are " +
          "non-secret identifiers copied from the Railway dashboard; no tokens are stored.",
      };
    }
    // Requested success but the required non-secret identifiers are missing:
    // fail closed rather than emit an ambiguous partial-success state.
    return {
      outcome: "failed_closed",
      code: DEFAULT_CLOSED_CODE,
      project_id: null,
      dashboardUrl: null,
      detail:
        "Provision was requested as success but a non-secret project_id and/or a valid " +
        "https://railway dashboard URL were not supplied, so the outcome is reported as an " +
        "explicit closed failure instead of an ambiguous partial success.",
    };
  }

  // No env-driven success in this build (the Vercel build cannot be given the
  // FOUNDATION_* env). Fall back to the approved Vault Provisioner's committed
  // non-secret identity attestation so the deployed artifact reflects the real,
  // verified provisioning success. VAULT_LOCKED still forces a closed failure and
  // is never overridden by the attestation.
  if (!isFlagTrue("VAULT_LOCKED")) {
    const identity = readProvisionIdentity();
    if (identity && identity.armed === true && (identity.outcome ?? "success") === "success") {
      const attPid = normalizeProjectId(identity.project_id);
      const attUrl =
        normalizeDashboardUrl(identity.dashboard_url) ??
        (attPid ? normalizeDashboardUrl(`https://railway.app/project/${attPid}`) : null);
      if (attPid && attUrl) {
        return {
          outcome: "success",
          code: null,
          project_id: attPid,
          dashboardUrl: attUrl,
          detail:
            "Railway project `vygo` is provisioned by the approved Vault Provisioner run, attested " +
            "in shared/provision-identity.json. project_id and dashboard URL are non-secret public " +
            "identifiers copied from Railway; no token, vault consumer key, or connection string is " +
            "read, stored, or emitted.",
        };
      }
    }
  }

  const envCode = (process.env.FOUNDATION_PROVISION_CODE ?? "").trim().toLowerCase();
  const code: ClosedFailureCode = (CLOSED_FAILURE_CODES as readonly string[]).includes(envCode)
    ? (envCode as ClosedFailureCode)
    : DEFAULT_CLOSED_CODE;

  return {
    outcome: "failed_closed",
    code,
    project_id: null,
    dashboardUrl: null,
    detail:
      "Auto-provisioning was not armed for this foundation pass: no Railway services were " +
      "auto-created and no project_id was emitted. This is an explicit closed failure " +
      "(`" +
      code +
      "`), not a silent partial success. A human operator attaches services using the " +
      "stubs and next steps referenced below.",
  };
}

/** Env NAME sets (names only — values live in Railway plugins / the owner's vault). */
const ENV_NAMES = {
  api: [
    "NODE_ENV",
    "PORT",
    "DATABASE_URL",
    "REDIS_URL",
    "CORS_ORIGINS",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SECRET",
    "TURNSTILE_SECRET_KEY",
    "IP_HASH_SALT",
    "IP_HASH_SALT_VERSION",
    "EMAIL_FROM",
    "LEAD_NOTIFICATION_EMAIL",
    "RATE_LIMIT_IP_MAX",
    "RATE_LIMIT_IP_WINDOW_SECONDS",
    "RATE_LIMIT_EMAIL_MAX",
    "RATE_LIMIT_EMAIL_WINDOW_SECONDS",
    "MIN_FORM_COMPLETION_MS",
    "LOG_LEVEL",
    "INLINE_EMAIL_WORKER",
    "ENABLE_TEST_SURFACE",
  ],
  worker: [
    "NODE_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "LEAD_NOTIFICATION_EMAIL",
    "LOG_LEVEL",
    "WORKER_POLL_INTERVAL_MS",
    "WORKER_BATCH_SIZE",
    "WORKER_MAX_ATTEMPTS",
    "INLINE_EMAIL_WORKER",
  ],
  webPublic: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
} as const;

const STUBS = [
  "deploy/railway/README.md",
  "deploy/railway/api/.env.example",
  "deploy/railway/worker/.env.example",
];

/** Documented Railway API cut-over target — public identifier, never a secret. */
const RAILWAY_API_TARGET_ORIGIN = "https://api.vygo.ai";
/** Reachable API origin today: the Vercel edge mirror of /health + /version. */
const EDGE_API_MIRROR_ORIGIN = "https://www.vygo.ai";

/**
 * The four in-project services + two managed plugins, with the Railway/Vault
 * reference wiring for DATABASE_URL and REDIS_URL. Reference tokens
 * (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`) resolve to values inside
 * Railway at deploy time and are never materialized into git, logs, or this
 * artifact — only the reference expressions (which contain no secret) appear.
 */
const SERVICES = [
  {
    name: "Postgres",
    kind: "railway-plugin",
    managed: true,
    provides: ["DATABASE_URL"],
    reference: "${{Postgres.DATABASE_URL}}",
  },
  {
    name: "Redis",
    kind: "railway-plugin",
    managed: true,
    provides: ["REDIS_URL"],
    reference: "${{Redis.REDIS_URL}}",
  },
  {
    name: "vygo-api",
    kind: "railway-service",
    managed: false,
    source: "southu/vygo",
    dockerfile: "Dockerfile",
    config: "railway.toml",
    startCommand: "pnpm --filter @vygo/api start",
    healthcheckPath: "/healthz",
    references: {
      DATABASE_URL: "${{Postgres.DATABASE_URL}}",
      REDIS_URL: "${{Redis.REDIS_URL}}",
    },
  },
  {
    name: "vygo-worker",
    kind: "railway-service",
    managed: false,
    source: "southu/vygo",
    dockerfile: "Dockerfile",
    config: "deploy/railway/worker/railway.toml",
    startCommand: "pnpm --filter @vygo/worker start",
    healthcheckPath: "/healthz",
    references: {
      DATABASE_URL: "${{Postgres.DATABASE_URL}}",
      REDIS_URL: "${{Redis.REDIS_URL}}",
    },
  },
] as const;

/**
 * How each environment reference is supplied. DATABASE_URL / REDIS_URL come from
 * the Railway Postgres/Redis plugins via reference expressions; the remaining
 * secrets are Vault-backed (referenced by name; values injected at deploy).
 */
const ENV_REFERENCES = {
  railwayPlugins: {
    DATABASE_URL: "${{Postgres.DATABASE_URL}}",
    REDIS_URL: "${{Redis.REDIS_URL}}",
  },
  vaultBacked: {
    note: "Secret VALUES are supplied from the owner's Vault at deploy time, referenced by name. Never copied, printed, or committed.",
    names: [
      "RESEND_API_KEY",
      "RESEND_WEBHOOK_SECRET",
      "TURNSTILE_SECRET_KEY",
      "IP_HASH_SALT",
      "IP_HASH_SALT_VERSION",
    ],
  },
} as const;

/** Exact, executable Railway CLI actions to finish provisioning (no secrets). */
const REMAINING_ACTIONS = [
  { step: "link", command: "railway login && railway link --project vygo" },
  { step: "add-postgres", command: "railway add --database postgres" },
  { step: "add-redis", command: "railway add --database redis" },
  {
    step: "add-api-service",
    command: "railway add --service vygo-api --repo southu/vygo",
  },
  {
    step: "add-worker-service",
    command: "railway add --service vygo-worker --repo southu/vygo",
  },
  {
    step: "wire-api-references",
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
    command:
      "railway variables --service vygo-worker " +
      '--set "DATABASE_URL=${{Postgres.DATABASE_URL}}" ' +
      '--set "REDIS_URL=${{Redis.REDIS_URL}}" ' +
      '--set "NODE_ENV=production" --set "INLINE_EMAIL_WORKER=false"',
  },
  {
    step: "wire-vault-secrets",
    command:
      "railway variables --service vygo-api " +
      '--set "RESEND_API_KEY=${{shared.RESEND_API_KEY}}" ' +
      '--set "RESEND_WEBHOOK_SECRET=${{shared.RESEND_WEBHOOK_SECRET}}" ' +
      '--set "TURNSTILE_SECRET_KEY=${{shared.TURNSTILE_SECRET_KEY}}" ' +
      '--set "IP_HASH_SALT=${{shared.IP_HASH_SALT}}"',
  },
  {
    step: "migrate",
    command: "railway run --service vygo-api pnpm db:migrate",
  },
  {
    step: "set-frontend-api-base-url",
    command: "vercel env add NEXT_PUBLIC_API_BASE_URL production   # value: https://api.vygo.ai",
  },
] as const;

/** Exact, executable verification commands (no secrets in output). */
const VERIFICATION_COMMANDS = [
  "curl -fsS https://api.vygo.ai/healthz",
  "curl -fsS https://api.vygo.ai/readyz",
  "curl -fsS https://api.vygo.ai/health",
  "railway status --service vygo-api",
  "railway status --service vygo-worker",
  "railway variables --service vygo-api   # confirm DATABASE_URL/REDIS_URL are reference-wired",
] as const;

/** Scan a serialized payload for credential-shaped strings. */
function selfScan(payload: string): { passed: boolean; findings: string[] } {
  const findings: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(payload)) findings.push(pattern.name);
  }
  return { passed: findings.length === 0, findings };
}

function main() {
  const provision = resolveProvision();

  // Services were auto-created only when provisioning actually succeeded.
  const autoCreated = provision.outcome === "success";
  const servicesAutoCreated = {
    postgres: autoCreated,
    redis: autoCreated,
    api: autoCreated,
    worker: autoCreated,
  };

  const stubsPresent = STUBS.every((f) => exists(f));
  const nextStepsDocPresent = exists("docs/railway-backend-readiness.md");

  // "clear-stub" = failed closed, but config stubs + human next steps exist and
  // are linked from this surface, so a human can attach services deterministically.
  const provisionSuccessOrClearStub =
    (provision.outcome === "success" && !!provision.project_id && !!provision.dashboardUrl) ||
    (provision.outcome === "failed_closed" &&
      provision.code !== null &&
      stubsPresent &&
      nextStepsDocPresent);

  // Report body WITHOUT the secretsScan/gate blocks; those are attached after the
  // self-scan runs over this exact payload.
  const body = {
    artifact: "railway-backend-foundation",
    app: "vygo",
    project: "vygo",
    gitSha: gitSha(),
    generatedAt: new Date().toISOString(),
    hosting: {
      summary: "Site → Vercel. API / DB / Redis / worker → Railway (project vygo).",
      site: { component: "apps/web", platform: "vercel", retargetedToRailway: false },
      api: { component: "apps/api", platform: "railway", project: "vygo" },
      worker: { component: "apps/worker", platform: "railway", project: "vygo" },
      postgres: { component: "postgres", platform: "railway", project: "vygo" },
      redis: { component: "redis", platform: "railway", project: "vygo" },
    },
    // Full target topology: the four services + two managed plugins with the
    // Railway/Vault reference wiring for DATABASE_URL and REDIS_URL.
    services: SERVICES,
    envReferences: ENV_REFERENCES,
    // The frontend and marketing site stay on Vercel; neither is a Railway service.
    frontend: {
      component: "apps/web",
      platform: "vercel",
      isRailwayService: false,
      retargetedToRailway: false,
      apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
      // Reachable API origin today (the Vercel edge mirror of /health + /version)
      // until the Railway API is provisioned; the documented cut-over target is
      // railwayApiTargetOrigin. Neither is a secret; the frontend stays on Vercel.
      apiBaseUrl: EDGE_API_MIRROR_ORIGIN,
      apiOriginMode: "vercel-edge-mirror",
      railwayApiLive: false,
      railwayApiTargetOrigin: RAILWAY_API_TARGET_ORIGIN,
      provisioningStatus: "/provisioning-status",
      note: "The Vercel frontend targets the reachable API origin via NEXT_PUBLIC_API_BASE_URL and is not deployed to Railway. The Railway API's /health and /version are mirrored on the Vercel edge until the Railway services are provisioned; on cut-over, NEXT_PUBLIC_API_BASE_URL points at the Railway API's public HTTPS origin.",
    },
    marketingSite: {
      component: "apps/web",
      platform: "vercel",
      isRailwayService: false,
      domains: ["https://www.vygo.ai", "https://vygo.ai"],
    },
    cors: {
      productionOrigins: ["https://www.vygo.ai", "https://vygo.ai"],
      previewOriginPattern: "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$",
      previewOriginExamples: [
        "https://vygo-git-main-southu.vercel.app",
        "https://vygo-preview.vercel.app",
      ],
      unrestrictedProductionWildcard: false,
      note: "Exact production origins + documented vygo Vercel preview origins are reflected individually. Unrelated origins receive no Access-Control-Allow-Origin; a `*` wildcard is never emitted.",
    },
    provision: {
      outcome: provision.outcome,
      code: provision.code,
      project_id: provision.project_id,
      dashboardUrl: provision.dashboardUrl,
      detail: provision.detail,
      closedFailureCodes: [...CLOSED_FAILURE_CODES],
    },
    servicesAutoCreated,
    humanNextSteps: {
      required: !autoCreated,
      doc: "docs/railway-backend-readiness.md#next-steps-project-vygo--services-not-yet-running",
      stubs: STUBS,
      stubsPresent,
    },
    // Explicit limitation record (criterion 4): when the provisioner is
    // project-shell-only, service creation is blocked this run. The blocked
    // actions and exact, executable remaining/verification commands are listed
    // inline so the topology can be completed deterministically without secrets.
    limitation: {
      blocked: !autoCreated,
      kind: autoCreated ? "none" : "project-shell-only-provisioner",
      reason: autoCreated
        ? "Provisioning succeeded; services were created."
        : "The Railway provisioner failed closed (" +
          (provision.code ?? "consumer_not_armed") +
          "): this builder holds no Railway token or Vault consumer key, so it created only the project shell and could not add Postgres, Redis, the API service, the worker service, or their reference-wired environment this run.",
      blockedActions: autoCreated
        ? []
        : [
            "add-postgres",
            "add-redis",
            "add-api-service",
            "add-worker-service",
            "wire-railway-and-vault-references",
          ],
      remainingActions: REMAINING_ACTIONS,
      verificationCommands: VERIFICATION_COMMANDS,
    },
    env: {
      note:
        "Names only. No values. Backend secrets come from the owner's vault; DATABASE_URL / " +
        "REDIS_URL come from the Railway plugins. NEXT_PUBLIC_* are public browser values.",
      backend: {
        api: [...ENV_NAMES.api],
        worker: [...ENV_NAMES.worker],
      },
      webPublic: [...ENV_NAMES.webPublic],
    },
    apiSmoke: {
      required: false,
      status: autoCreated ? "available" : "skipped",
      reason: autoCreated
        ? "API service exists; smoke can run against its public health endpoints."
        : "No non-secret-testable Railway API service exists yet (services not auto-created). " +
          "Live production Fastify API smoke is not required for the foundation gate; it is " +
          "deferred to human attach + health-check verification (GET /healthz, /readyz, /health).",
    },
    docs: {
      readiness: "docs/railway-backend-readiness.md",
      deployment: "docs/deployment.md",
      credentials: "docs/credentials-and-decisions.md",
      stubs: "deploy/railway/README.md",
    },
  };

  const scan = selfScan(JSON.stringify(body));
  if (!scan.passed) {
    console.error(
      `foundation-status: self-scan detected credential-shaped strings: ${scan.findings.join(", ")}`,
    );
    process.exit(1);
  }

  const secretsScan = {
    policy: "names-only",
    artifactSelfScan: scan.passed ? "passed" : "failed",
    detectedSecrets: scan.findings.length,
    enforcedBy: "pnpm secret-scan (CI, scripts/secret-scan.ts)",
  };

  // Deploy gate: go ONLY when provision is success-or-clear-stub AND secrets are clean.
  const secretsClean = scan.passed && secretsScan.detectedSecrets === 0;
  const verdict: "go" | "no-go" = provisionSuccessOrClearStub && secretsClean ? "go" : "no-go";
  const gate = {
    verdict,
    forHumanAttachOn: "vygo",
    reason:
      verdict === "go"
        ? provision.outcome === "success"
          ? "Provision succeeded with a non-secret project_id + dashboard URL and the secrets " +
            "policy self-scan is clean. Foundation is go for human Railway service attach on vygo."
          : "Provision failed closed with an explicit code (`" +
            provision.code +
            "`) AND config stubs + human next steps are present and linked (clear-stub) AND the " +
            "secrets policy self-scan is clean. Foundation is go for human Railway service attach on vygo."
        : "Foundation is NOT ready: provision is neither a clean success nor a clear stub, or the " +
          "secrets self-scan is not clean. Resolve before human Railway service attach.",
    conditions: {
      provisionSuccessOrClearStub,
      secretsClean,
    },
  };

  const report = { ...body, secretsScan, gate };

  const publicApiDir = path.join(root, "apps/web/public/api");
  mkdirSync(publicApiDir, { recursive: true });
  writeFileSync(
    path.join(publicApiDir, "railway-foundation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const generatedDir = path.join(root, "apps/web/src/generated");
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(
    path.join(generatedDir, "railway-foundation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Wrote apps/web/public/api/railway-foundation.json ` +
      `(provision=${report.provision.outcome}` +
      `${report.provision.code ? `:${report.provision.code}` : ""}, gate=${report.gate.verdict})`,
  );

  // Fail the build only under --strict if the gate is no-go (never silently ship no-go).
  if (report.gate.verdict === "no-go" && process.argv.includes("--strict")) {
    process.exit(1);
  }
}

main();
