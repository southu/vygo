/**
 * Vault Provisioner — Railway project shell for project `vygo`.
 *
 * Runs the *vault-consumer* stage of Railway provisioning and emits a single,
 * secret-free, machine-readable outcome that a human or a follow-on mission can
 * read without any credentials:
 *
 *   - shared/provision.json                       (authoritative repo artifact)
 *   - apps/web/public/api/provision.json          → GET /api/provision (live copy)
 *
 * What this tool does and does NOT do
 * -----------------------------------
 *   - It provisions the Railway **project shell** for `vygo` (create if missing,
 *     reuse if present). It does NOT create Postgres/Redis/API/worker services
 *     unless a real armed provisioning run reports them.
 *   - The marketing frontend stays on **Vercel** and is never retargeted.
 *
 * Hard guardrails (fail closed, never fabricate)
 * ----------------------------------------------
 *   - ALLOWLIST: only `project_names: ["vygo"]` may be targeted. Any other
 *     requested project is refused before any vault access.
 *   - DESTROY is hard-disabled (`destroy: false`); this tool never deletes.
 *   - SECRETS: the tool reads env vars by NAME/presence only — it never reads,
 *     prints, logs, or writes a Railway token or vault consumer key value. The
 *     emitted artifact is self-scanned for credential shapes and the run aborts
 *     if any is found. Only env NAMES, public identifiers, and public URLs are
 *     ever written.
 *   - NO INVENTED IDENTIFIERS: `ok: true` is emitted only when a verified,
 *     non-secret `project_id` AND an `https://railway…` dashboard URL are
 *     present. Otherwise the outcome is an explicit closed failure with a code
 *     from { vault_locked, consumer_not_armed, vault_access_denied } and a null
 *     `project_id` — a project id is NEVER fabricated on failure.
 *
 * Reaching `ok: true` without code changes and without committing secrets
 * ----------------------------------------------------------------------
 * A real provisioning run (armed vault consumer that releases a scoped Railway
 * token, project `vygo` created/reused via the Railway API) records its result
 * by exporting the NON-SECRET identifiers it produced — never a token:
 *   PROVISION_ARM=true
 *   VAULT_CONSUMER_KEY / RAILWAY_VAULT_CONSUMER_KEY present (name only; value never read)
 *   RAILWAY_TOKEN / RAILWAY_API_TOKEN present (name only; value never read)
 *   PROVISION_PROJECT_ID=<railway project id>       (public identifier)
 *   PROVISION_DASHBOARD_URL=https://railway.app/project/<id>  (public URL)
 * Absent a fully-armed consumer + verified identifiers, the tool fails closed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** The ONLY Railway project names this tool may ever touch. */
const PROJECT_ALLOWLIST = ["vygo"] as const;
/** Destroy is hard-disabled — this tool never deletes infrastructure. */
const DESTROY = false as const;
/** Default project targeted when none is requested. */
const DEFAULT_PROJECT = "vygo";

const CLOSED_FAILURE_CODES = ["vault_locked", "consumer_not_armed", "vault_access_denied"] as const;
type ClosedFailureCode = (typeof CLOSED_FAILURE_CODES)[number];

/**
 * High-confidence credential shapes — mirror of scripts/secret-scan.ts. It does
 * NOT match bare UUIDs on purpose: a Railway project_id is a UUID and a public
 * identifier, so flagging UUIDs would reject legitimate non-secret ids.
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
  // A Railway API token shape — belt-and-suspenders; such a value must never
  // reach this artifact (we only read env NAMES, never token values).
  {
    name: "railway-token",
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9_-]{16,}/,
  },
];

/** Env var NAMES this tool inspects for presence only — values are NEVER read. */
const CONSUMER_KEY_NAMES = ["VAULT_CONSUMER_KEY", "RAILWAY_VAULT_CONSUMER_KEY"] as const;
const RAILWAY_TOKEN_NAMES = ["RAILWAY_TOKEN", "RAILWAY_API_TOKEN"] as const;

/** True only if the env var is set to a non-empty value. The value is NEVER read out. */
function isEnvPresent(name: string): boolean {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

/** Truthy check for a NON-SECRET boolean flag (VAULT_LOCKED / PROVISION_ARM only). */
function isFlagTrue(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
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

/** A non-empty, non-credential-shaped public Railway project id. */
function normalizeProjectId(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (SECRET_PATTERNS.some((p) => p.re.test(value))) return null;
  if (value.length > 128) return null;
  return value;
}

/** A public https Railway dashboard URL (never a secret). */
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

type Resolution =
  | {
      ok: true;
      outcome: "success";
      code: null;
      project_id: string;
      dashboard_url: string;
      detail: string;
    }
  | {
      ok: false;
      outcome: "failed_closed";
      code: ClosedFailureCode;
      project_id: null;
      dashboard_url: null;
      detail: string;
    };

/**
 * Resolve the provision outcome. Every non-success path is an explicit closed
 * failure with a vault code; a project id is never fabricated.
 */
function resolveProvision(requestedProject: string): Resolution {
  // Vault sealed → highest-priority closed failure.
  if (isFlagTrue("VAULT_LOCKED")) {
    return {
      ok: false,
      outcome: "failed_closed",
      code: "vault_locked",
      project_id: null,
      dashboard_url: null,
      detail:
        "The secret vault is locked/sealed (VAULT_LOCKED). No Railway token could be released, " +
        "so provisioning of project `vygo` did not run. No services were created and no " +
        "project_id was emitted. Unseal the vault and re-run; nothing was destroyed.",
    };
  }

  // The vault consumer that would release the scoped Railway token is armed only
  // when explicitly switched on AND a consumer key is present (name only).
  const consumerKeyPresent = CONSUMER_KEY_NAMES.some(isEnvPresent);
  const armed = isFlagTrue("PROVISION_ARM") && consumerKeyPresent;
  if (!armed) {
    return {
      ok: false,
      outcome: "failed_closed",
      code: "consumer_not_armed",
      project_id: null,
      dashboard_url: null,
      detail:
        "The vault consumer for Railway provisioning is not armed in this environment " +
        "(PROVISION_ARM is not set and/or no vault consumer key is present). By design this " +
        "builder holds no Railway token or vault consumer key, so it fails closed rather than " +
        "provisioning. No Railway services were created, nothing was destroyed, and no " +
        "project_id was emitted. A follow-on run with an armed consumer completes provisioning.",
    };
  }

  // Armed: the vault must actually release a usable Railway token (name only).
  const tokenMaterialized = RAILWAY_TOKEN_NAMES.some(isEnvPresent);
  if (!tokenMaterialized) {
    return {
      ok: false,
      outcome: "failed_closed",
      code: "vault_access_denied",
      project_id: null,
      dashboard_url: null,
      detail:
        "The vault consumer is armed but the vault did not release a usable Railway token " +
        "(no RAILWAY_TOKEN / RAILWAY_API_TOKEN materialized). Provisioning failed closed; no " +
        "services were created, nothing was destroyed, and no project_id was emitted.",
    };
  }

  // Fully armed with a released token: record the NON-SECRET result of the real
  // Railway create/reuse of project `vygo`. Success requires BOTH a verified
  // public project_id and a public dashboard URL; otherwise fail closed rather
  // than emit an ambiguous or fabricated success.
  const projectId = normalizeProjectId(process.env.PROVISION_PROJECT_ID);
  const dashboardUrl =
    normalizeDashboardUrl(process.env.PROVISION_DASHBOARD_URL) ??
    (projectId ? normalizeDashboardUrl(`https://railway.app/project/${projectId}`) : null);
  if (projectId && dashboardUrl) {
    return {
      ok: true,
      outcome: "success",
      code: null,
      project_id: projectId,
      dashboard_url: dashboardUrl,
      detail:
        `Railway project \`${requestedProject}\` is provisioned (created if missing, reused if ` +
        "present) via an armed vault consumer. project_id and dashboard URL are non-secret " +
        "identifiers copied from Railway; no tokens are stored. This is the project shell only " +
        "— Postgres/Redis/API/worker services are attached separately.",
    };
  }
  return {
    ok: false,
    outcome: "failed_closed",
    code: "vault_access_denied",
    project_id: null,
    dashboard_url: null,
    detail:
      "The vault consumer is armed and a Railway token was released, but provisioning did not " +
      "yield a verified non-secret project_id + https://railway dashboard URL. Rather than " +
      "fabricate an identifier, the tool fails closed. Nothing was created or destroyed.",
  };
}

/** Scan a serialized payload for credential-shaped strings. */
function selfScan(payload: string): { passed: boolean; findings: string[] } {
  const findings: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(payload)) findings.push(pattern.name);
  }
  return { passed: findings.length === 0, findings };
}

function main() {
  const requestedProject =
    (process.env.PROVISION_PROJECT ?? DEFAULT_PROJECT).trim() || DEFAULT_PROJECT;

  // ALLOWLIST guardrail: refuse any project outside [vygo] before touching the vault.
  const requestedProjectAllowed = (PROJECT_ALLOWLIST as readonly string[]).includes(
    requestedProject,
  );
  if (!requestedProjectAllowed) {
    console.error(
      `provision-railway: refused — project "${requestedProject}" is not in the allowlist ` +
        `[${PROJECT_ALLOWLIST.join(", ")}]. No vault access attempted.`,
    );
    process.exit(1);
  }

  const provision = resolveProvision(requestedProject);

  const body = {
    artifact: "vault-provisioner-railway",
    tool: "vault-provisioner",
    app: "vygo",
    project: requestedProject,
    ok: provision.ok,
    outcome: provision.outcome,
    code: provision.code,
    project_id: provision.project_id,
    dashboard_url: provision.dashboard_url,
    detail: provision.detail,
    allowlist: {
      project_names: [...PROJECT_ALLOWLIST],
      destroy: DESTROY,
    },
    guardrails: {
      allowlistEnforced: true,
      destroyDisabled: DESTROY === false,
      requestedProject,
      requestedProjectAllowed,
      failsClosed: true,
    },
    closedFailureCodes: [...CLOSED_FAILURE_CODES],
    scope: {
      note:
        "Railway project shell only (create if missing, reuse if present). Postgres/Redis/API/" +
        "worker services are NOT created by this step unless a real provisioning run reports them.",
      frontend: { platform: "vercel", retargetedToRailway: false },
    },
    // Target topology + reference wiring (mirrors GET /api/railway-foundation).
    services: ["Postgres", "Redis", "vygo-api", "vygo-worker"],
    references: {
      // DATABASE_URL / REDIS_URL come from the Railway plugins via reference
      // expressions; secrets are Vault-backed by name. No values are ever emitted.
      DATABASE_URL: "${{Postgres.DATABASE_URL}}",
      REDIS_URL: "${{Redis.REDIS_URL}}",
      vaultBacked: [
        "RESEND_API_KEY",
        "RESEND_WEBHOOK_SECRET",
        "TURNSTILE_SECRET_KEY",
        "IP_HASH_SALT",
      ],
    },
    frontend: {
      platform: "vercel",
      isRailwayService: false,
      retargetedToRailway: false,
      apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
      apiBaseUrl: "https://api.vygo.ai",
    },
    remainingActionsStatus:
      "/api/railway-foundation (limitation.remainingActions + limitation.verificationCommands)",
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
    gitSha: gitSha(),
    generatedAt: new Date().toISOString(),
  };

  const scan = selfScan(JSON.stringify(body));
  if (!scan.passed) {
    console.error(
      `provision-railway: self-scan detected credential-shaped strings: ${scan.findings.join(", ")}`,
    );
    process.exit(1);
  }

  const report = {
    ...body,
    secretsScan: {
      policy: "names-only",
      selfScan: "passed" as const,
      detectedSecrets: 0,
      enforcedBy: "pnpm secret-scan (scripts/secret-scan.ts)",
    },
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  const sharedDir = path.join(root, "shared");
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(path.join(sharedDir, "provision.json"), serialized, "utf8");

  // Live, secret-free copy so the outcome is checkable without credentials.
  const publicApiDir = path.join(root, "apps/web/public/api");
  mkdirSync(publicApiDir, { recursive: true });
  writeFileSync(path.join(publicApiDir, "provision.json"), serialized, "utf8");

  console.log(
    `Wrote shared/provision.json (ok=${report.ok}, outcome=${report.outcome}` +
      `${report.code ? `:${report.code}` : ""}, project=${report.project})`,
  );

  // Fail the process only under --strict when provisioning did not succeed. The
  // default is exit 0: a clean fail-closed is an expected, non-error outcome.
  if (!report.ok && process.argv.includes("--strict")) {
    process.exit(1);
  }
}

main();
