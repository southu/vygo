import { z } from "zod";

/**
 * Typed environment validation for Vygo services.
 * Secrets are never logged; only presence and shape are validated.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const webEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_API_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /**
   * Public HTTPS origin of the Railway-hosted API the Vercel frontend targets.
   * Browser-safe (NEXT_PUBLIC_*); never a secret. Defaults to the Railway API
   * custom domain in the deployed build (see RAILWAY_API_BASE_URL).
   */
  NEXT_PUBLIC_API_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  COMMIT_SHA: z.preprocess(emptyToUndefined, z.string().optional()),
  VERCEL_GIT_COMMIT_SHA: z.preprocess(emptyToUndefined, z.string().optional()),
});

/**
 * Canonical HTTPS origin of the Railway-hosted API service (project `vygo`).
 * This custom domain is attached to the Railway API service; the Railway-issued
 * default domain has the form `https://<service>.up.railway.app`. It is a public,
 * non-secret identifier — safe to publish in the frontend and provisioning docs.
 */
export const RAILWAY_API_BASE_URL = "https://api.vygo.ai";

/** Production marketing origins that always receive CORS (exact allowlist). */
export const DEFAULT_MARKETING_ORIGINS = ["https://www.vygo.ai", "https://vygo.ai"] as const;

/**
 * Documented Vercel preview-origin policy for the `vygo` project.
 *
 * Vercel issues preview deployments on the project-scoped subdomain space
 * `https://vygo-<deployment|git-branch>-<scope>.vercel.app`. Preview origins
 * matching this host pattern are reflected individually in
 * `Access-Control-Allow-Origin` (never a `*` wildcard). Any origin that is not an
 * exact production origin and does not match this pattern receives no permissive
 * ACAO — so unrelated origins (including arbitrary `*.vercel.app` that are not the
 * vygo project) are never granted access.
 */
export const VERCEL_PREVIEW_ORIGIN_PATTERN = "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$";
const VERCEL_PREVIEW_HOST_RE = /^vygo(?:-[a-z0-9-]+)?\.vercel\.app$/i;

/** True when `origin` is an HTTPS Vercel preview origin for the vygo project. */
export function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    if (url.port) return false;
    return VERCEL_PREVIEW_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Whether `origin` may receive a reflected `Access-Control-Allow-Origin`: it is
 * either on the exact allowlist (production/configured origins) or a documented
 * vygo Vercel preview origin. Never authorizes a `*` wildcard.
 */
export function isAllowedApiOrigin(origin: string, allowlist: Iterable<string>): boolean {
  for (const allowed of allowlist) {
    if (allowed === origin) return true;
  }
  return isVercelPreviewOrigin(origin);
}

/**
 * Cloudflare Turnstile official test secret keys (always-pass / always-fail / already-spent).
 * Safe for local development and CI only — never a request-level bypass.
 */
export const CLOUDFLARE_TURNSTILE_TEST_SECRETS = {
  alwaysPasses: "1x0000000000000000000000000000000AA",
  alwaysBlocks: "2x0000000000000000000000000000000AA",
  alreadySpent: "3x0000000000000000000000000000000AA",
} as const;

export const CLOUDFLARE_TURNSTILE_TEST_TOKENS = {
  alwaysPasses: "XXXX.DUMMY.TOKEN.XXXX",
  alwaysBlocks: "XXXX.DUMMY.TOKEN.XXXX",
} as const;

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  TURNSTILE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Comma-separated allowlist. Also accepts ALLOWED_ORIGINS as an alias. */
  CORS_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
  ALLOWED_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Max request body size in bytes (default 64 KiB). */
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(64 * 1024),
  REQUEST_ID_HEADER: z.string().default("x-request-id"),
  /** Current IP hash salt (required for production waitlist). */
  IP_HASH_SALT: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  /** Previous salt retained during rotation window. */
  IP_HASH_SALT_PREVIOUS: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  /** Version tag for the current salt (stored with hash as `v{N}:hex`). */
  IP_HASH_SALT_VERSION: z.coerce.number().int().positive().default(1),
  /** Previous salt version during rotation. Defaults to version - 1 when previous salt set. */
  IP_HASH_SALT_PREVIOUS_VERSION: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),
  RATE_LIMIT_EMAIL_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_EMAIL_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),
  /** Minimum form completion time in ms before submission is accepted. */
  MIN_FORM_COMPLETION_MS: z.coerce.number().int().nonnegative().default(2000),
  UTM_MAX_LENGTH: z.coerce.number().int().positive().default(128),
  LEAD_NOTIFICATION_EMAIL: z.preprocess(
    emptyToUndefined,
    z.string().email().optional().default("hello@vygo.ai"),
  ),
  /**
   * When true, expose non-production inspection + integration-report surfaces.
   * Defaults on for non-production, or when Turnstile uses a Cloudflare test secret.
   */
  ENABLE_TEST_SURFACE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  /**
   * Integration fault injection (non-production only): `none` | `lead` | `outbox`.
   * Never activatable via request fields/headers/query in production.
   */
  TEST_FAULT_MODE: z
    .preprocess(emptyToUndefined, z.enum(["none", "lead", "outbox"]).optional())
    .default("none"),
  /** High-score alert threshold for optional internal notification (not public). */
  LEAD_SCORE_ALERT_THRESHOLD: z.coerce.number().int().default(8),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  /**
   * When true, the API process runs an in-process email worker (local live harness).
   * Production Railway should run `apps/worker` separately and leave this unset/false.
   */
  INLINE_EMAIL_WORKER: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Max age of worker heartbeat for GET /health (ms). */
  WORKER_HEARTBEAT_MAX_AGE_MS: z.coerce.number().int().positive().default(60_000),
});

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  LEAD_NOTIFICATION_EMAIL: z.preprocess(
    emptyToUndefined,
    z.string().email().optional().default("hello@vygo.ai"),
  ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /**
   * When true, the API process runs an in-process email worker (local live harness).
   * Production Railway should run `apps/worker` separately and leave this unset/false.
   */
  INLINE_EMAIL_WORKER: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWebEnv(env: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(env);
}

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return apiEnvSchema.parse(env);
}

export function loadWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return workerEnvSchema.parse(env);
}

export function getDeployedGitSha(env: NodeJS.ProcessEnv = process.env): string {
  const sha =
    env.VERCEL_GIT_COMMIT_SHA || env.COMMIT_SHA || env.GIT_COMMIT_SHA || env.GITHUB_SHA || "";
  return sha.trim();
}

/** Parse CORS / allowed origin allowlist from API env. */
export function parseCorsOrigins(env: ApiEnv): string[] {
  const raw = env.CORS_ORIGINS || env.ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether non-production test inspection / report routes may be registered. */
export function isTestSurfaceEnabled(env: ApiEnv): boolean {
  if (env.ENABLE_TEST_SURFACE === "true") return true;
  if (env.ENABLE_TEST_SURFACE === "false") return false;
  if (env.NODE_ENV !== "production") return true;
  // Ratchet / local production-like deploys often use Cloudflare test secrets.
  const secret = env.TURNSTILE_SECRET_KEY ?? "";
  if (
    secret === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses ||
    secret === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysBlocks ||
    secret === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alreadySpent
  ) {
    return true;
  }
  // No real Turnstile secret configured → not a locked-down production edge.
  if (!secret) return true;
  return false;
}

export function isProductionStrict(env: ApiEnv): boolean {
  return env.NODE_ENV === "production" && !isTestSurfaceEnabled(env);
}
