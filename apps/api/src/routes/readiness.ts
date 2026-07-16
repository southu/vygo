/**
 * Public Readiness Check session API.
 *
 * POST   /v1/readiness/session          — create session, return resumable token
 * GET    /v1/readiness/session/:token   — resume draft/stage state
 * PATCH  /v1/readiness/session/:token   — save draft/stage state
 * POST   /v1/readiness/lead             — log off-ramp / intake lead
 * POST   /v1/readiness/email-prompt     — email diagnostic prompt + resume link
 * POST   /v1/readiness/parse            — parse paste-back report (stage 3/4)
 *
 * All Postgres writes go through these server endpoints. Rate-limited by IP.
 * Never returns connection strings, DATABASE_URL, stack traces, or secrets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createReadinessSession,
  findReadinessSessionByToken,
  patchReadinessSessionByToken,
  logReadinessLead,
  enqueueReadinessPromptEmail,
  redactSensitivePaste,
  insertReadinessSubmission,
  type DatabaseHandle,
} from "@vygo/db";
import {
  buildConfirmationFindings,
  describeSize,
  describeStack,
  normalizeReadinessPaste,
  parseReadinessPastePartial,
  parseReadinessReportV1,
  scanPasteForSecrets,
} from "@vygo/validation";
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
 * cycles). Use ONE shared readiness IP bucket with a short window so:
 * - a normal multi-step flow (create + several PATCH/GET) always has headroom
 * - create cannot succeed while resume/save is locked out (same budget)
 * - a 30+ burst still hits 429 within the window
 * - waitlist/apply IP exhaustion cannot block readiness (separate key prefix)
 * - v3 key prefix abandons any v1/v2 or waitlist-poisoned Redis counters
 * - Retry-After is seconds/minutes (window), never a 1-hour hard lock
 * Do not share `rl:ip:` with waitlist (RATE_LIMIT_IP_*).
 *
 * Budget ~20 ops / 60s per IP ≈ interactive use; abuse still rate-limits.
 */
const READINESS_RL_LIMIT = 20;
const READINESS_RL_WINDOW_SECONDS = 60;

/** PII-safe key for readiness-only IP dimension (separate from waitlist). */
function readinessIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:v3:ip:${ipHash}`;
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
 * Rate-limit readiness endpoints by client IP (single readiness-only bucket).
 * Shared across create/GET/PATCH so a multi-step session cannot be half-blocked.
 * Uses salted IP hash when configured; otherwise a non-stored HMAC bucket so
 * limits still apply without logging or persisting raw IPs.
 */
async function enforceReadinessRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  const limit = READINESS_RL_LIMIT;
  const windowSeconds = READINESS_RL_WINDOW_SECONDS;

  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessIpRateLimitKey(ipHashResult.hash);
  } else {
    // Fall back: bucket by HMAC of IP with a fixed pepper (key only — not stored as PII).
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessIpRateLimitKey(`rlfb:${digest}`);
  }

  const result = await checkRateLimit(deps.rateLimitStore, bucketKey, limit, windowSeconds);

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(result.retryAfterSeconds || windowSeconds, windowSeconds),
    );
    request.log.info(
      { event: "readiness_rate_limited", retryAfterSeconds: retryAfter },
      "rate limited",
    );
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

export function registerReadinessRoutes(app: FastifyInstance, deps: ReadinessRouteDeps): void {
  app.post("/v1/readiness/session", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

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
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

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
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

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

  app.post("/v1/readiness/lead", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reasonRaw || reasonRaw.length > 64) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "reason is required (max 64 chars)."));
    }
    const token =
      typeof body.token === "string" && body.token.trim() ? body.token.trim().slice(0, 128) : null;
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim().toLowerCase().slice(0, 254)
        : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "Invalid email address."));
    }
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : null;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const result = await logReadinessLead(dbHandle.db, {
        token,
        reason: reasonRaw,
        answers,
        email,
      });
      request.log.info(
        { event: "readiness_lead_logged", reason: reasonRaw, hasToken: Boolean(token) },
        "readiness lead logged",
      );
      return reply.status(201).send({ accepted: true, id: result.id });
    } catch (error) {
      request.log.error(
        { event: "readiness_lead_failed" },
        error instanceof Error ? error.message : "lead failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.post("/v1/readiness/email-prompt", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 50_000) : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "A valid email is required."));
    }
    if (!token || !TOKEN_RE.test(token)) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }
    if (!prompt || prompt.trim().length < 20) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "prompt is required."));
    }

    const origin =
      (deps.env as { PUBLIC_WEB_ORIGIN?: string }).PUBLIC_WEB_ORIGIN?.trim() ||
      "https://www.vygo.ai";
    const resumeUrl = `${origin.replace(/\/$/, "")}/readiness?token=${encodeURIComponent(token)}`;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const result = await enqueueReadinessPromptEmail(dbHandle.db, {
        email,
        token,
        prompt,
        resumeUrl,
      });
      request.log.info(
        { event: "readiness_prompt_email_queued", hasToken: true },
        "readiness prompt email queued",
      );
      return reply.status(202).send({
        accepted: true,
        queued: true,
        resumeUrl,
        idempotencyKey: result.idempotencyKey,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_email_prompt_failed" },
        error instanceof Error ? error.message : "email prompt failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Stage 3/4 paste-back parse. Client already ran a high-confidence secret
   * scan; server re-checks, redacts, best-effort parses, and persists draft.
   */
  app.post("/v1/readiness/parse", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    const paste = typeof body.paste === "string" ? body.paste.slice(0, 100_000) : "";
    if (!token || !TOKEN_RE.test(token)) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }
    if (!paste || paste.trim().length < 8) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "paste is required."));
    }

    // Fail closed if secrets still present (client should have blocked).
    const secretScan = scanPasteForSecrets(paste);
    if (!secretScan.clean) {
      return reply.status(400).send({
        error: {
          code: "SECRETS_DETECTED",
          message: "Remove secrets before submitting.",
        },
        lines: secretScan.lines,
      });
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

      const normalized = normalizeReadinessPaste(paste);
      const redacted = redactSensitivePaste(normalized);
      const full = parseReadinessReportV1(normalized);
      const partial = full ?? parseReadinessPastePartial(normalized);
      const parseStatus = full ? "ok" : Object.keys(partial).length > 0 ? "partial" : "pending";
      const stack = describeStack(partial);
      const size = describeSize(partial);
      const findings = buildConfirmationFindings(partial, 6);

      const draft = {
        ...session.draft,
        pasteText: redacted.slice(0, 50_000),
        source: "paste",
        report: partial as Record<string, unknown>,
        parseStatus,
        parseUpdatedAt: new Date().toISOString(),
      };

      const updated = await patchReadinessSessionByToken(dbHandle.db, token, {
        stage: "confirm",
        draft,
      });

      // Best-effort submission row (redacted paste only).
      try {
        const rows = await dbHandle.sql<{ id: string }[]>`
          SELECT id FROM readiness_sessions WHERE token = ${token} LIMIT 1
        `;
        const sessionId = rows[0]?.id ?? null;
        await insertReadinessSubmission(dbHandle.db, {
          sessionId,
          parsedReport: partial as Record<string, unknown>,
          rawPasteRedacted: redacted.slice(0, 50_000),
          bucket: `paste:${parseStatus}`,
          contact: { source: "readiness_paste", parseStatus },
        });
      } catch {
        // non-fatal — draft is the source of truth for resume
      }

      request.log.info(
        { event: "readiness_parse", parseStatus, hasFindings: findings.length > 0 },
        "readiness paste parsed",
      );

      return reply.status(200).send({
        token,
        stage: updated?.stage ?? "confirm",
        parseStatus,
        stack,
        size,
        findings,
        report: partial,
        draft: updated?.draft ?? draft,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_parse_failed" },
        error instanceof Error ? error.message : "parse failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });
}
