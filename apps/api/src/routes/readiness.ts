/**
 * Public Readiness Check session API.
 *
 * POST   /v1/readiness/session          — create session, return resumable token
 * GET    /v1/readiness/session/:token   — resume draft/stage state
 * PATCH  /v1/readiness/session/:token   — save draft/stage state
 *
 * All Postgres writes go through these server endpoints. Rate-limited by IP.
 * Never returns connection strings, DATABASE_URL, stack traces, or secrets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createReadinessSession,
  findReadinessSessionByToken,
  patchReadinessSessionByToken,
  type DatabaseHandle,
} from "@vygo/db";
import type { ApiEnv } from "@vygo/config";
import { safeError } from "../errors.js";
import { resolveClientIp } from "../services/client-ip.js";
import { hashIpAddress } from "../services/ip-hash.js";
import {
  checkRateLimit,
  type RateLimitStore,
} from "../services/rate-limit.js";

/** Resumable tokens are base64url of 24 bytes (32 chars) or legacy UUID. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Readiness session endpoints are interactive (create + several PATCH/GET
 * cycles). Use dedicated buckets and a short window so:
 * - normal multi-step flows have headroom (create + several PATCH/GET)
 * - a 30+ burst on token routes still hits 429
 * - GET/PATCH bursts cannot starve create (separate keys)
 * - waitlist/apply IP exhaustion cannot block session create
 * - v2 key prefix abandons any pre-TTL-repair poisoned Redis counters
 * Do not share `rl:ip:` with waitlist (RATE_LIMIT_IP_*).
 */
const READINESS_CREATE_RL_LIMIT = 20;
const READINESS_TOKEN_RL_LIMIT = 40;
const READINESS_RL_WINDOW_SECONDS = 120;

type ReadinessRlKind = "create" | "token";

/** PII-safe key for readiness-only IP dimension (separate from waitlist). */
function readinessIpRateLimitKey(kind: ReadinessRlKind, ipHash: string): string {
  return `rl:readiness:v2:${kind}:ip:${ipHash}`;
}

export type ReadinessRouteDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
};

/** Ensure readiness tables exist (bootstrap when formal migrate has not run yet). */
export async function ensureReadinessTables(dbHandle: DatabaseHandle): Promise<void> {
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      token text NOT NULL,
      stage text DEFAULT 'intake' NOT NULL,
      draft jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      session_id uuid,
      parsed_report jsonb,
      raw_paste_redacted text,
      scores jsonb,
      bucket text,
      discrepancy_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
      contact jsonb,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      retention_expires_at timestamp with time zone DEFAULT (now() + interval '90 days') NOT NULL
    )
  `;
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_question_bank (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      question_key text NOT NULL,
      prompt text NOT NULL,
      category text DEFAULT 'general' NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      active boolean DEFAULT true NOT NULL,
      metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_scoring_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      config_key text NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      rules jsonb DEFAULT '{}'::jsonb NOT NULL,
      weights jsonb DEFAULT '{}'::jsonb NOT NULL,
      active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  try {
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_sessions_token_uidx ON readiness_sessions (token)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_sessions_updated_at_idx ON readiness_sessions (updated_at)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_submissions_session_id_idx ON readiness_submissions (session_id)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_submissions_retention_idx ON readiness_submissions (retention_expires_at)`;
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_question_bank_key_uidx ON readiness_question_bank (question_key)`;
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_scoring_config_key_version_uidx ON readiness_scoring_config (config_key, version)`;
  } catch {
    // index races are non-fatal
  }
}

function isJsonContentType(header: string | string[] | undefined): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return false;
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "application/json";
}

function parseTokenParam(params: unknown): string | null {
  if (params == null || typeof params !== "object") return null;
  const token = (params as { token?: unknown }).token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed || !TOKEN_RE.test(trimmed)) return null;
  return trimmed;
}

function parseSessionBody(
  body: unknown,
):
  | { ok: true; stage?: string; draft?: Record<string, unknown> }
  | { ok: false; status: number; error: ReturnType<typeof safeError> } {
  // Empty body is fine for create; PATCH may send {}.
  if (body == null || body === "") {
    return { ok: true };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: safeError("BAD_REQUEST", "Request body must be a JSON object."),
    };
  }
  const record = body as Record<string, unknown>;
  let stage: string | undefined;
  let draft: Record<string, unknown> | undefined;

  if (record.stage !== undefined) {
    if (typeof record.stage !== "string") {
      return {
        ok: false,
        status: 400,
        error: safeError("VALIDATION_ERROR", "stage must be a string."),
      };
    }
    stage = record.stage;
  }

  if (record.draft !== undefined) {
    if (record.draft == null || typeof record.draft !== "object" || Array.isArray(record.draft)) {
      return {
        ok: false,
        status: 400,
        error: safeError("VALIDATION_ERROR", "draft must be a JSON object."),
      };
    }
    draft = record.draft as Record<string, unknown>;
  }

  return { ok: true, stage, draft };
}

/**
 * Rate-limit readiness endpoints by client IP (readiness-only bucket).
 * Create and token routes use separate keys so resume/save traffic cannot
 * permanently starve session creation. Uses salted IP hash when configured;
 * otherwise a non-stored HMAC bucket so limits still apply without logging
 * or persisting raw IPs.
 */
async function enforceReadinessRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
  kind: ReadinessRlKind,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  const limit = kind === "create" ? READINESS_CREATE_RL_LIMIT : READINESS_TOKEN_RL_LIMIT;
  const windowSeconds = READINESS_RL_WINDOW_SECONDS;

  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessIpRateLimitKey(kind, ipHashResult.hash);
  } else {
    // Fall back: bucket by HMAC of IP with a fixed pepper (key only — not stored as PII).
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessIpRateLimitKey(kind, `rlfb:${digest}`);
  }

  const result = await checkRateLimit(deps.rateLimitStore, bucketKey, limit, windowSeconds);

  if (!result.allowed) {
    request.log.info({ event: "readiness_rate_limited", kind }, "rate limited");
    await reply
      .status(429)
      .header("Retry-After", String(result.retryAfterSeconds || windowSeconds))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

export function registerReadinessRoutes(app: FastifyInstance, deps: ReadinessRouteDeps): void {
  app.post("/v1/readiness/session", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps, "create"))) return;

    // Content-Type optional when body empty; when present must be JSON.
    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const parsed = parseSessionBody(request.body ?? {});
    if (!parsed.ok) {
      return reply.status(parsed.status).send(parsed.error);
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await createReadinessSession(dbHandle.db, {
        stage: parsed.stage,
        draft: parsed.draft,
      });
      return reply.status(201).send(session);
    } catch (error) {
      request.log.error(
        { event: "readiness_session_create_failed" },
        error instanceof Error ? error.message : "create failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.get("/v1/readiness/session/:token", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps, "token"))) return;

    const token = parseTokenParam(request.params);
    if (!token) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid session token."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await findReadinessSessionByToken(dbHandle.db, token);
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }
      return reply.status(200).send(session);
    } catch (error) {
      request.log.error(
        { event: "readiness_session_get_failed" },
        error instanceof Error ? error.message : "get failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.patch("/v1/readiness/session/:token", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps, "token"))) return;

    const token = parseTokenParam(request.params);
    if (!token) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid session token."));
    }

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const parsed = parseSessionBody(request.body);
    if (!parsed.ok) {
      return reply.status(parsed.status).send(parsed.error);
    }

    if (parsed.stage === undefined && parsed.draft === undefined) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "Provide stage and/or draft to update."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await patchReadinessSessionByToken(dbHandle.db, token, {
        stage: parsed.stage,
        draft: parsed.draft,
      });
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }
      return reply.status(200).send(session);
    } catch (error) {
      request.log.error(
        { event: "readiness_session_patch_failed" },
        error instanceof Error ? error.message : "patch failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });
}
