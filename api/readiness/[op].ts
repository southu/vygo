/**
 * Shared edge handler for readiness POST/GET actions (Hobby function budget):
 *   POST /api/readiness/lead
 *   POST /api/readiness/email-prompt
 *   POST /api/readiness/parse
 *   POST /api/readiness/followups
 *   POST /api/readiness/followups/answer  (op: followups-answer)
 *   GET  /api/readiness/submission
 *   GET  /api/readiness/status            (submission-token poll: pending/ready/expired)
 *
 * One Vercel serverless function covers these paths so we stay under the
 * 12-function Hobby limit. Rewrites from /v1/readiness/* still apply.
 *
 * Prefer Railway Fastify when live; fall back to deterministic edge parse +
 * session-draft persistence. Never returns secrets. Browser traffic is
 * same-origin on www.vygo.ai only.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { createHash, randomUUID } from "node:crypto";
import {
  logLeadRow,
  proxyEmailPrompt,
  proxyFollowups,
  proxyFollowupsAnswer,
  proxyGetBrief,
  proxyGetSession,
  proxyGetSnapshot,
  proxyGetSubmission,
  proxyLogLead,
  proxyParsePaste,
  proxyPatchSession,
  proxyScore,
  proxyScorePreview,
  proxyScoreE2E,
  proxySnapshotEmail,
  proxyToken,
  proxySubmit,
  proxyRunStart,
  proxyRunComplete,
  proxyGetStatus,
  proxyCreateAnalysis,
  proxyListAnalyses,
  proxyGetAnalysis,
  proxyGetAnalysisResult,
  proxyAnalysesDemo,
  resolveDatabaseUrl,
  resolveEdgeClientIp,
  type ReadinessHandlerResult,
} from "../_lib/readiness.js";
import {
  edgeDetectDiscrepancies,
  edgeParsePaste,
  edgeRedactSecrets,
  edgeSelectFollowups,
} from "../_lib/readiness-stage34.js";
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../_lib/http.js";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_OPS = new Set([
  "lead",
  "email-prompt",
  "parse",
  "followups",
  "followups-answer",
  "submission",
  "brief",
  "score",
  "score-preview",
  "score-e2e",
  "snapshot",
  "snapshot-email",
  "token",
  "submit",
  "status",
  "ping",
  "analyses",
  "analysis",
  "result",
  "demo",
  "start",
  "run",
  "complete",
]);

/** Shared readiness edge rate-limit budget (aligns with Railway ~20/60s). */
const rlBuckets = new Map<string, { count: number; expiresAt: number }>();
const RL_LIMIT = 20;
const RL_WINDOW_MS = 60 * 1000;

/**
 * Dedicated status-poll budget. The waiting readiness page polls on a short
 * interval, so status gets its own generous bucket — sharing the 20/60s ops
 * budget would let plain polling starve parse/session calls.
 */
const statusRlBuckets = new Map<string, { count: number; expiresAt: number }>();
const STATUS_RL_LIMIT = 90;
const STATUS_RL_WINDOW_MS = 60 * 1000;

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;

function getSql(url: string): Sql {
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    cachedUrl = url;
  }
  return cachedSql;
}

function checkEdgeRateLimit(req: EdgeRequest): { allowed: boolean; retryAfterSeconds: number } {
  const raw = resolveEdgeClientIp(req.headers) || "unknown";
  const ipPart = createHash("sha256").update(String(raw)).digest("hex").slice(0, 32);
  const shard = raw === "unknown" ? Math.floor(Date.now() / RL_WINDOW_MS) : 0;
  const key = `readiness:ops:${ipPart}:t${shard}`;
  const now = Date.now();
  const existing = rlBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    rlBuckets.set(key, { count: 1, expiresAt: now + RL_WINDOW_MS });
    if (rlBuckets.size > 500) {
      for (const [k, v] of rlBuckets) {
        if (v.expiresAt <= now) rlBuckets.delete(k);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  if (existing.count > RL_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function rateLimitedResult(retryAfterSeconds: number): ReadinessHandlerResult {
  return {
    status: 429,
    body: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many attempts. Please try again later.",
      },
    },
    retryAfterSeconds,
  };
}

function checkStatusRateLimit(req: EdgeRequest): { allowed: boolean; retryAfterSeconds: number } {
  const raw = resolveEdgeClientIp(req.headers) || "unknown";
  const ipPart = createHash("sha256").update(String(raw)).digest("hex").slice(0, 32);
  const shard = raw === "unknown" ? Math.floor(Date.now() / STATUS_RL_WINDOW_MS) : 0;
  const key = `readiness:status:${ipPart}:t${shard}`;
  const now = Date.now();
  const existing = statusRlBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    statusRlBuckets.set(key, { count: 1, expiresAt: now + STATUS_RL_WINDOW_MS });
    if (statusRlBuckets.size > 500) {
      for (const [k, v] of statusRlBuckets) {
        if (v.expiresAt <= now) statusRlBuckets.delete(k);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  if (existing.count > STATUS_RL_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

async function ensureSubmissionTables(sql: Sql): Promise<void> {
  await sql`
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
  await sql`
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
  await sql`
    CREATE TABLE IF NOT EXISTS readiness_ingest_tokens (
      token text PRIMARY KEY,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS readiness_ingest_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      token text NOT NULL,
      payload jsonb NOT NULL,
      received_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
}

function applyBaseHeaders(res: EdgeResponse, origin: string | null, credentials = true): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (credentials) res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Ops that intentionally allow cross-origin POSTs from ANY origin, no
 * allowlist check. Mirrors `PERMISSIVE_CORS_PATHS` in apps/api/src/cors.ts:
 * a customer's AI agent calls the ingest op from an arbitrary host/tool
 * origin, not a browser tab on vygo.ai, so it cannot be restricted the way
 * every other (browser-driven) readiness op is. The op itself still fails
 * closed on bad tokens, oversized bodies, and rate limits — CORS here only
 * controls which origins a *browser* would let read the response.
 */
const PERMISSIVE_CORS_OPS = new Set<string>([
  "submit",
  "ping",
  "analyses",
  "analysis",
  "result",
  "demo",
  "start",
  "run",
  "complete",
]);

/** Reflects the requesting origin (or `*` when none was sent) with no credentials. */
function applyPermissiveCorsHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
}

function resolveOp(req: EdgeRequest): string | null {
  // Vercel dynamic segment is available on query for Node serverless handlers.
  const q = (req as EdgeRequest & { query?: Record<string, string | string[]> }).query;
  const raw = q?.op;
  const fromQuery = Array.isArray(raw) ? raw[0] : raw;
  if (typeof fromQuery === "string" && fromQuery.trim()) {
    return fromQuery.trim();
  }
  try {
    const url = String(
      (req as EdgeRequest & { url?: string }).url ||
        (req.headers["x-invoke-path"] as string | undefined) ||
        "",
    );
    const path = url.split("?")[0] || "";
    const segment = path.split("/").filter(Boolean).pop() || "";
    return segment || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// lead
// ---------------------------------------------------------------------------

async function logLeadViaSessionDraft(
  input: {
    token: string | null;
    reason: string;
    answers: Record<string, unknown> | null;
    email: string | null;
  },
  req: EdgeRequest,
): Promise<ReadinessHandlerResult> {
  const loggedAt = new Date().toISOString();
  const leadMeta = {
    source: "readiness_off_ramp",
    reason: input.reason.slice(0, 64),
    loggedAt,
    answers: input.answers,
    email: input.email,
  };

  console.info(
    JSON.stringify({
      event: "readiness_lead_logged_edge",
      reason: input.reason.slice(0, 64),
      hasToken: Boolean(input.token),
      hasEmail: Boolean(input.email),
    }),
  );

  if (!input.token) {
    return {
      status: 201,
      body: { accepted: true, id: `edge-lead-${Date.now()}`, path: "edge_log" },
    };
  }

  const existing = await proxyGetSession(input.token, process.env, req.headers);
  if (existing.status >= 200 && existing.status < 300) {
    const draft =
      existing.body.draft &&
      typeof existing.body.draft === "object" &&
      !Array.isArray(existing.body.draft)
        ? { ...(existing.body.draft as Record<string, unknown>) }
        : {};
    draft.offRamp = { kind: input.reason, loggedAt };
    draft.lead = leadMeta;
    if (input.email) draft.email = input.email;
    if (input.answers) draft.stage1 = { ...(draft.stage1 as object | undefined), ...input.answers };
    const patched = await proxyPatchSession(
      input.token,
      { stage: "off_ramp", draft },
      process.env,
      req.headers,
    );
    if (patched.status >= 200 && patched.status < 300) {
      return {
        status: 201,
        body: {
          accepted: true,
          id: `session:${input.token.slice(0, 12)}`,
          path: "session_draft",
        },
      };
    }
  }

  return {
    status: 201,
    body: { accepted: true, id: `edge-lead-${Date.now()}`, path: "edge_log" },
  };
}

async function handleLead(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }

  const record =
    parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
      ? (parsedBody.value as Record<string, unknown>)
      : {};
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (!reason || reason.length > 64) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "reason is required (max 64 chars)." },
      },
    };
  }
  const token =
    typeof record.token === "string" && record.token.trim()
      ? record.token.trim().slice(0, 128)
      : null;
  const email =
    typeof record.email === "string" && record.email.trim()
      ? record.email.trim().toLowerCase().slice(0, 254)
      : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "Invalid email address." } },
    };
  }
  const answers =
    record.answers && typeof record.answers === "object" && !Array.isArray(record.answers)
      ? (record.answers as Record<string, unknown>)
      : null;

  const url = resolveDatabaseUrl();
  if (url) {
    try {
      const sql = getSql(url);
      const result = await logLeadRow(sql, { reason, token, email, answers });
      return { status: 201, body: { accepted: true, id: result.id } };
    } catch (error) {
      return {
        status: 500,
        body: {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred. Please try again later.",
          },
        },
        logError: error,
      };
    }
  }

  const proxied = await proxyLogLead({ reason, token, email, answers }, process.env, req.headers);
  if (proxied.status >= 200 && proxied.status < 300) {
    return proxied;
  }
  if (proxied.status === 404 || proxied.status >= 500) {
    return logLeadViaSessionDraft({ token, reason, answers, email }, req);
  }
  return proxied;
}

// ---------------------------------------------------------------------------
// email-prompt
// ---------------------------------------------------------------------------

async function emailPromptFallback(
  input: { email: string; token: string; prompt: string },
  req: EdgeRequest,
): Promise<ReadinessHandlerResult> {
  const resumeUrl = `https://www.vygo.ai/readiness?token=${encodeURIComponent(input.token)}`;
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  const idempotencyKey = `readiness-prompt:${input.token.slice(0, 80)}:${input.email.slice(0, 120)}:h${hour}`;
  let outboxQueued = false;

  // Prefer durable outbox when edge has DATABASE_URL (same Postgres as Railway).
  const dbUrl = resolveDatabaseUrl();
  if (dbUrl) {
    try {
      const sql = getSql(dbUrl);
      await sql`
        CREATE TABLE IF NOT EXISTS email_outbox (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          waitlist_entry_id uuid,
          kind text NOT NULL,
          recipient text NOT NULL,
          payload jsonb NOT NULL,
          idempotency_key text NOT NULL,
          status text DEFAULT 'pending' NOT NULL,
          attempt_count integer DEFAULT 0 NOT NULL,
          next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
          locked_at timestamp with time zone,
          locked_by text,
          last_error text,
          sent_at timestamp with time zone,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_idempotency_uidx ON email_outbox (idempotency_key)`;
      await sql`
        INSERT INTO email_outbox (waitlist_entry_id, kind, recipient, payload, idempotency_key, status)
        VALUES (
          NULL,
          'readiness_prompt',
          ${input.email},
          ${JSON.stringify({
            kind: "readiness_prompt",
            email: input.email,
            token: input.token,
            prompt: input.prompt.slice(0, 50_000),
            resumeUrl,
          })}::jsonb,
          ${idempotencyKey},
          'pending'
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
      outboxQueued = true;
    } catch {
      outboxQueued = false;
    }
  }

  console.info(
    JSON.stringify({
      event: "readiness_prompt_email_queued_edge_fallback",
      hasToken: true,
      outboxQueued,
      mock: !outboxQueued,
    }),
  );

  const existing = await proxyGetSession(input.token, process.env, req.headers);
  if (existing.status >= 200 && existing.status < 300) {
    const draft =
      existing.body.draft &&
      typeof existing.body.draft === "object" &&
      !Array.isArray(existing.body.draft)
        ? { ...(existing.body.draft as Record<string, unknown>) }
        : {};
    draft.email = input.email;
    draft.emailPromptRequest = {
      requestedAt: new Date().toISOString(),
      resumeUrl,
      promptRequested: true,
      policy: outboxQueued ? "edge_outbox" : "mock_outbox_pending_railway",
      idempotencyKey,
    };
    await proxyPatchSession(input.token, { draft }, process.env, req.headers);
  }

  return {
    status: 202,
    body: {
      accepted: true,
      queued: true,
      mock: !outboxQueued,
      resumeUrl,
      idempotencyKey,
      path: outboxQueued ? "edge_outbox" : "edge_mock_outbox",
    },
  };
}

async function handleEmailPrompt(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const contentType = contentTypeBase(req.headers);
  if (contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }

  const record =
    parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
      ? (parsedBody.value as Record<string, unknown>)
      : {};
  const email =
    typeof record.email === "string" ? record.email.trim().toLowerCase().slice(0, 254) : "";
  const token = typeof record.token === "string" ? record.token.trim().slice(0, 128) : "";
  const prompt = typeof record.prompt === "string" ? record.prompt.slice(0, 50_000) : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "A valid email is required." } },
    };
  }
  if (!token || token.length < 16) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A valid session token is required." },
      },
    };
  }
  if (!prompt || prompt.trim().length < 20) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "prompt is required." } },
    };
  }

  const proxied = await proxyEmailPrompt({ email, token, prompt }, process.env, req.headers);
  if (proxied.status >= 200 && proxied.status < 300) {
    return proxied;
  }
  if (proxied.status === 404 || proxied.status >= 500) {
    return emailPromptFallback({ email, token, prompt }, req);
  }
  return proxied;
}

// ---------------------------------------------------------------------------
// parse (Stage 3 paste-back) + followups (Stage 4) + submission read-back
// ---------------------------------------------------------------------------

async function persistParseResult(
  token: string,
  parsed: ReturnType<typeof edgeParsePaste>,
  req: EdgeRequest,
): Promise<ReadinessHandlerResult> {
  if (parsed.didRedact) {
    console.info(
      JSON.stringify({
        event: "readiness_paste_redacted",
        hitCount: parsed.hitCount,
        // Never log secret values — count only.
      }),
    );
  }

  const stage = parsed.routeToManual ? "manual" : "confirm";
  const existing = await proxyGetSession(token, process.env, req.headers);
  if (existing.status === 404) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Session not found." } },
    };
  }

  const baseDraft =
    existing.status >= 200 &&
    existing.status < 300 &&
    existing.body.draft &&
    typeof existing.body.draft === "object" &&
    !Array.isArray(existing.body.draft)
      ? { ...(existing.body.draft as Record<string, unknown>) }
      : {};

  let submissionId: string | null = null;
  const dbUrl = resolveDatabaseUrl();
  if (dbUrl) {
    try {
      const sql = getSql(dbUrl);
      await ensureSubmissionTables(sql);
      const sessions = await sql<{ id: string }[]>`
        SELECT id FROM readiness_sessions WHERE token = ${token} LIMIT 1
      `;
      const sessionId = sessions[0]?.id ?? null;
      const rows = await sql<{ id: string }[]>`
        INSERT INTO readiness_submissions (
          session_id, parsed_report, raw_paste_redacted, bucket, discrepancy_flags, contact
        ) VALUES (
          ${sessionId},
          ${sql.json(parsed.report as never)},
          ${parsed.redacted},
          ${`paste:${parsed.parseStatus}`},
          ${sql.json([] as never)},
          ${sql.json({
            source: "readiness_paste",
            parseStatus: parsed.parseStatus,
            routeToManual: parsed.routeToManual,
            redacted: parsed.didRedact,
          } as never)}
        )
        RETURNING id
      `;
      submissionId = rows[0]?.id ?? null;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "readiness_submission_insert_edge_failed",
          message: error instanceof Error ? error.message : "insert failed",
        }),
      );
    }
  }

  const draft = {
    ...baseDraft,
    pasteText: parsed.redacted,
    rawPasteRedacted: parsed.redacted,
    source: "paste",
    report: parsed.report,
    parseStatus: parsed.parseStatus,
    routeToManual: parsed.routeToManual,
    parseUpdatedAt: new Date().toISOString(),
    redaction: { didRedact: parsed.didRedact, hitCount: parsed.hitCount },
    submissionId,
    discrepancyFlags: Array.isArray(baseDraft.discrepancyFlags) ? baseDraft.discrepancyFlags : [],
  };

  const patched = await proxyPatchSession(token, { stage, draft }, process.env, req.headers);

  return {
    status: 200,
    body: {
      token,
      stage: patched.status >= 200 && patched.status < 300 ? stage : stage,
      parseStatus: parsed.parseStatus,
      routeToManual: parsed.routeToManual,
      stack: parsed.stack,
      size: parsed.size,
      findings: parsed.findings,
      report: parsed.report,
      submissionId,
      draft: patched.status >= 200 && patched.status < 300 ? (patched.body.draft ?? draft) : draft,
      path: "edge_deterministic",
    },
  };
}

async function handleParse(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }

  const body = (parsedBody.value ?? {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
  const paste = typeof body.paste === "string" ? body.paste.slice(0, 100_000) : "";

  if (!token || !TOKEN_RE.test(token)) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A valid session token is required." },
      },
    };
  }
  if (!paste || paste.trim().length < 8) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "paste is required." } },
    };
  }

  // Prefer Railway when the route exists; pass-through 429 / 400 validation.
  const upstream = await proxyParsePaste({ token, paste }, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) {
    return upstream;
  }
  if (upstream.status === 429) {
    return {
      status: 429,
      body: upstream.body,
      retryAfterSeconds: upstream.retryAfterSeconds ?? 60,
    };
  }
  if (upstream.status === 400) {
    const code = (upstream.body.error as { code?: string } | undefined)?.code;
    // Upstream still rejects secrets — fall through to edge redact-and-accept.
    if (code === "VALIDATION_ERROR") return upstream;
    if (code === "NOT_FOUND") return upstream;
  }
  if (upstream.status === 404) {
    const code = (upstream.body.error as { code?: string } | undefined)?.code;
    if (code === "NOT_FOUND") {
      // Session missing on Railway — surface it.
      // Route-not-found from Fastify uses message "Route POST:..." without our code.
      if (typeof upstream.body.error === "object" && upstream.body.error) {
        const msg = String((upstream.body.error as { message?: string }).message || "");
        if (msg.includes("Session not found")) return upstream;
      }
    }
  }

  // Edge deterministic parse: redact secrets (accept), never 5xx for sloppy input.
  const parsed = edgeParsePaste(paste);
  return persistParseResult(token, parsed, req);
}

async function handleFollowups(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  const body = (parsedBody.value ?? {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
  if (!token || !TOKEN_RE.test(token)) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A valid session token is required." },
      },
    };
  }

  const upstream = await proxyFollowups({ token, report: body.report }, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) return upstream;
  if (upstream.status === 429) {
    return {
      status: 429,
      body: upstream.body,
      retryAfterSeconds: upstream.retryAfterSeconds ?? 60,
    };
  }

  const session = await proxyGetSession(token, process.env, req.headers);
  if (session.status === 404) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Session not found." } },
    };
  }
  const draft =
    session.body.draft &&
    typeof session.body.draft === "object" &&
    !Array.isArray(session.body.draft)
      ? (session.body.draft as Record<string, unknown>)
      : {};
  const report =
    draft.report && typeof draft.report === "object" && !Array.isArray(draft.report)
      ? (draft.report as Record<string, unknown>)
      : body.report && typeof body.report === "object" && !Array.isArray(body.report)
        ? (body.report as Record<string, unknown>)
        : {};

  const questions = edgeSelectFollowups(report);
  return {
    status: 200,
    body: {
      token,
      source: "readiness_question_bank",
      questions,
      path: "edge_seed",
    },
  };
}

async function handleFollowupsAnswer(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  const body = (parsedBody.value ?? {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : null;
  if (!token || !TOKEN_RE.test(token)) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A valid session token is required." },
      },
    };
  }
  if (!answers || Object.keys(answers).length === 0) {
    return {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "answers are required." } },
    };
  }

  const upstream = await proxyFollowupsAnswer({ token, answers }, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) return upstream;
  if (upstream.status === 429) {
    return {
      status: 429,
      body: upstream.body,
      retryAfterSeconds: upstream.retryAfterSeconds ?? 60,
    };
  }

  const session = await proxyGetSession(token, process.env, req.headers);
  if (session.status === 404) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Session not found." } },
    };
  }
  const draft =
    session.body.draft &&
    typeof session.body.draft === "object" &&
    !Array.isArray(session.body.draft)
      ? { ...(session.body.draft as Record<string, unknown>) }
      : {};
  const report =
    draft.report && typeof draft.report === "object" && !Array.isArray(draft.report)
      ? (draft.report as Record<string, unknown>)
      : {};

  const flags = edgeDetectDiscrepancies(report, answers);
  const prior = Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [];
  draft.discrepancyFlags = [...prior, ...flags];
  draft.followupAnswers = { ...(draft.followupAnswers as object | undefined), ...answers };
  draft.followupUpdatedAt = new Date().toISOString();

  await proxyPatchSession(token, { stage: "followups", draft }, process.env, req.headers);

  // Optional DB write when edge has DATABASE_URL.
  const dbUrl = resolveDatabaseUrl();
  if (dbUrl) {
    try {
      const sql = getSql(dbUrl);
      await ensureSubmissionTables(sql);
      const sessions = await sql<{ id: string }[]>`
        SELECT id FROM readiness_sessions WHERE token = ${token} LIMIT 1
      `;
      const sessionId = sessions[0]?.id ?? null;
      if (sessionId) {
        const existing = await sql<{ id: string; discrepancy_flags: unknown }[]>`
          SELECT id, discrepancy_flags FROM readiness_submissions
          WHERE session_id = ${sessionId}
          ORDER BY created_at DESC LIMIT 1
        `;
        if (existing[0]) {
          const merged = [
            ...(Array.isArray(existing[0].discrepancy_flags)
              ? (existing[0].discrepancy_flags as unknown[])
              : []),
            ...flags,
          ];
          await sql`
            UPDATE readiness_submissions
            SET discrepancy_flags = ${sql.json(merged as never)}
            WHERE id = ${existing[0].id}
          `;
        } else {
          await sql`
            INSERT INTO readiness_submissions (
              session_id, parsed_report, raw_paste_redacted, bucket, discrepancy_flags, contact
            ) VALUES (
              ${sessionId},
              ${sql.json(report as never)},
              ${typeof draft.rawPasteRedacted === "string" ? draft.rawPasteRedacted : null},
              ${"followups"},
              ${sql.json(flags as never)},
              ${sql.json({ source: "readiness_followups", answers } as never)}
            )
          `;
        }
      }
    } catch {
      // draft is source of truth
    }
  }

  // User-facing body omits discrepancy flags.
  return {
    status: 200,
    body: {
      token,
      accepted: true,
      stage: "followups",
      savedKeys: Object.keys(answers),
      path: "edge_draft",
    },
  };
}

async function handleSubmissionGet(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  let token = "";
  try {
    const url = String((req as EdgeRequest & { url?: string }).url || "");
    const q = url.includes("?") ? new URL(url, "https://www.vygo.ai").searchParams : null;
    token = q?.get("token")?.trim().slice(0, 128) || "";
  } catch {
    token = "";
  }
  // Vercel may also put query on req.query
  const qObj = (req as EdgeRequest & { query?: Record<string, string | string[]> }).query;
  if (!token && qObj?.token) {
    const raw = Array.isArray(qObj.token) ? qObj.token[0] : qObj.token;
    token = typeof raw === "string" ? raw.trim().slice(0, 128) : "";
  }

  if (!token || !TOKEN_RE.test(token)) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A valid session token is required." },
      },
    };
  }

  const upstream = await proxyGetSubmission(token, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) return upstream;
  if (upstream.status === 429) {
    return {
      status: 429,
      body: upstream.body,
      retryAfterSeconds: upstream.retryAfterSeconds ?? 60,
    };
  }

  // Edge read-back from session draft (+ optional DB).
  const session = await proxyGetSession(token, process.env, req.headers);
  if (session.status === 404) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Session not found." } },
    };
  }
  const draft =
    session.body.draft &&
    typeof session.body.draft === "object" &&
    !Array.isArray(session.body.draft)
      ? (session.body.draft as Record<string, unknown>)
      : {};

  type SubmissionRow = {
    id: string;
    parsed_report: unknown;
    raw_paste_redacted: string | null;
    discrepancy_flags: unknown;
    bucket: string | null;
    contact: unknown;
    created_at: Date | string;
  };
  let dbRow: SubmissionRow | null = null;
  const dbUrl = resolveDatabaseUrl();
  if (dbUrl) {
    try {
      const sql = getSql(dbUrl);
      await ensureSubmissionTables(sql);
      const sessions = await sql<{ id: string }[]>`
        SELECT id FROM readiness_sessions WHERE token = ${token} LIMIT 1
      `;
      const sessionId = sessions[0]?.id;
      if (sessionId) {
        const rows = await sql<SubmissionRow[]>`
          SELECT id, parsed_report, raw_paste_redacted, discrepancy_flags, bucket, contact, created_at
          FROM readiness_submissions
          WHERE session_id = ${sessionId}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        dbRow = rows[0] ?? null;
      }
    } catch {
      dbRow = null;
    }
  }

  const rawPaste =
    dbRow?.raw_paste_redacted ||
    (typeof draft.rawPasteRedacted === "string" ? draft.rawPasteRedacted : null) ||
    (typeof draft.pasteText === "string" ? draft.pasteText : null);

  if (!dbRow && !draft.report && !rawPaste) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Submission not found." } },
    };
  }

  // Prefer draft flags when present (answer path writes draft first; DB may lag
  // or still hold the empty array from the initial parse insert).
  const fromDraft = Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [];
  const fromDb =
    dbRow && Array.isArray(dbRow.discrepancy_flags) ? (dbRow.discrepancy_flags as unknown[]) : [];
  const discrepancyFlags = fromDraft.length > 0 ? fromDraft : fromDb;

  // Re-redact as a hard guard so API read-back never echoes planted secrets.
  const finalPaste = rawPaste ? edgeRedactSecrets(rawPaste).redacted : null;

  return {
    status: 200,
    body: {
      id:
        dbRow?.id ||
        (typeof draft.submissionId === "string"
          ? draft.submissionId
          : `draft:${token.slice(0, 8)}`),
      token,
      parsedReport:
        (dbRow?.parsed_report as Record<string, unknown> | null) ||
        (draft.report as Record<string, unknown> | null) ||
        null,
      rawPasteRedacted: finalPaste,
      discrepancyFlags,
      bucket: dbRow?.bucket || (typeof draft.bucket === "string" ? draft.bucket : null),
      contact: (dbRow?.contact as Record<string, unknown> | null) || null,
      createdAt:
        dbRow?.created_at instanceof Date
          ? dbRow.created_at.toISOString()
          : typeof dbRow?.created_at === "string"
            ? dbRow.created_at
            : new Date().toISOString(),
      path: dbRow ? "edge_db" : "edge_draft",
    },
  };
}

// ---------------------------------------------------------------------------
// brief read-back — proxy to Railway (source of truth)
// ---------------------------------------------------------------------------

async function handleBriefGet(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const submissionId = queryParam(req, "submissionId") || queryParam(req, "id");
  const token = queryParam(req, "token");
  if (!submissionId && !token) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "Provide submissionId or token." },
      },
    };
  }
  return proxyGetBrief(
    {
      submissionId: submissionId || undefined,
      token: token || undefined,
    },
    process.env,
    req.headers,
  );
}

// ---------------------------------------------------------------------------
// score / snapshot (Stage 5) — proxy to Railway (source of truth)
// ---------------------------------------------------------------------------

function queryParam(req: EdgeRequest, name: string): string {
  try {
    const url = String((req as EdgeRequest & { url?: string }).url || "");
    if (url.includes("?")) {
      const v = new URL(url, "https://www.vygo.ai").searchParams.get(name);
      if (v) return v.trim();
    }
  } catch {
    /* ignore */
  }
  const qObj = (req as EdgeRequest & { query?: Record<string, string | string[]> }).query;
  const raw = qObj?.[name];
  if (Array.isArray(raw)) return typeof raw[0] === "string" ? raw[0].trim() : "";
  return typeof raw === "string" ? raw.trim() : "";
}

async function handleScore(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  return proxyScore(parsedBody.value ?? {}, process.env, req.headers);
}

/**
 * Dry-run score: no Turnstile, no lead, no PII persistence.
 *
 * Proxies to Railway Fastify (POST /v1/readiness/score-preview). Does not import
 * @vygo/validation on the edge — workspace TS packages are not reliably
 * bundlable in this Hobby function and would crash the whole [op] handler.
 * Built-in dual profiles also remain on GET /api/readiness sampleAssessments.
 */
async function handleScoreE2E(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  return proxyScoreE2E(parsedBody.value ?? {}, process.env, req.headers);
}

async function handleScorePreview(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }

  const body =
    parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
      ? (parsedBody.value as Record<string, unknown>)
      : {};

  const upstream = await proxyScorePreview(body, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) {
    return upstream;
  }
  if (upstream.status === 429) {
    return {
      status: 429,
      body: upstream.body,
      retryAfterSeconds: upstream.retryAfterSeconds ?? 60,
    };
  }
  if (upstream.status === 400 || upstream.status === 415) {
    return upstream;
  }

  // Fail closed with a clear error — never invent scores or degrade silently.
  if (upstream.status === 404 || upstream.status >= 500 || upstream.status === 0) {
    return {
      status: 503,
      body: {
        error: {
          code: "SCORING_UNAVAILABLE",
          message:
            "Score preview is temporarily unavailable. Retry shortly, or use GET /api/readiness analysis.sampleAssessments for the built-in weak/strong profiles.",
        },
        sampleAssessmentsPath: "/api/readiness",
      },
    };
  }

  return upstream;
}

async function handleSnapshotGet(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const id = queryParam(req, "id");
  if (!id || !UUID_RE.test(id)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid snapshot id." } },
    };
  }
  return proxyGetSnapshot(id, process.env, req.headers);
}

async function handleSnapshotEmail(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const id = queryParam(req, "id");
  if (!id || !UUID_RE.test(id)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid snapshot id." } },
    };
  }
  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  return proxySnapshotEmail(id, parsedBody.value ?? {}, process.env, req.headers);
}

async function handleToken(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const url = resolveDatabaseUrl();
  if (!url) {
    return proxyToken({}, process.env, req.headers);
  }

  try {
    const sql = getSql(url);
    await ensureSubmissionTables(sql);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await sql`
      INSERT INTO readiness_ingest_tokens (token, expires_at)
      VALUES (${token}, ${expiresAt.toISOString()})
    `;

    return {
      status: 200,
      body: {
        token,
        expires_at: expiresAt.toISOString(),
        ttl: 1800,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not create submission token.",
        },
      },
      logError: error,
    };
  }
}

/**
 * A submission is only useful if it carries a non-empty `results` object
 * and/or a non-blank `results_text` string. Without one of these the token
 * would flip to "ready" with nothing for the waiting page to render, and it
 * would then poll forever against a payload that can never display.
 */
function hasUsableResultsPayload(body: Record<string, unknown>): boolean {
  const results = body.results;
  const hasResults =
    !!results &&
    typeof results === "object" &&
    !Array.isArray(results) &&
    Object.keys(results as Record<string, unknown>).length > 0;
  const resultsText = typeof body.results_text === "string" ? body.results_text.trim() : "";
  return hasResults || resultsText.length > 0;
}

async function handleSubmit(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }

  const body = (parsedBody.value ?? {}) as Record<string, unknown>;
  const submissionToken =
    typeof body.submission_token === "string" ? body.submission_token.trim() : "";

  if (!submissionToken) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "submission_token is required." },
      },
    };
  }

  if (!hasUsableResultsPayload(body)) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "A non-empty results object or results_text string is required.",
        },
      },
    };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    return proxySubmit(body, process.env, req.headers);
  }

  try {
    const sql = getSql(url);
    await ensureSubmissionTables(sql);

    // Validate token
    const tokenRows = await sql<{ token: string; expires_at: Date }[]>`
      SELECT token, expires_at
      FROM readiness_ingest_tokens
      WHERE token = ${submissionToken}
      LIMIT 1
    `;
    const tokenRow = tokenRows[0];
    if (!tokenRow) {
      return {
        status: 400,
        body: {
          error: { code: "INVALID_TOKEN", message: "The submission token is unknown or expired." },
        },
      };
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return {
        status: 400,
        body: {
          error: { code: "EXPIRED_TOKEN", message: "The submission token is unknown or expired." },
        },
      };
    }

    // Persist submission
    await sql`
      INSERT INTO readiness_ingest_submissions (token, payload)
      VALUES (${submissionToken}, ${sql.json(body as never)})
    `;

    // Durable analyses store (lead follow-up): also persist a NEW row keyed by
    // the real (user, project) with the FULL payload retained verbatim, so
    // /api/analyses can list/retrieve it independently of the expiring
    // token-status store. Best-effort: never fail an accepted submission on an
    // analyses-store hiccup.
    try {
      const { user, project, status } = deriveAnalysesIdentityEdge(body);
      if (user) {
        await ensureAnalysesTablesEdge(sql);
        // Retain the full readiness form payload verbatim, but drop the
        // per-submission capability token (transport metadata, not a form
        // field) so the publicly listable analyses response never echoes it.
        const { submission_token: _omitToken, ...analysisSubmission } = body;
        await sql`
          INSERT INTO analyses (user_identifier, project_identifier, status, submission)
          VALUES (${user}, ${resolveProjectIdentifierEdge(project)}, ${status}, ${JSON.stringify(analysisSubmission)}::jsonb)
        `;
      }
    } catch (analysisError) {
      // Non-blocking: the submission itself already succeeded above.
      if (typeof console !== "undefined") {
        console.warn("readiness submit: analyses-store persist failed (non-blocking)");
      }
      void analysisError;
    }

    return {
      status: 200,
      body: {
        message: "Vygo has successfully received your readiness results.",
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not submit readiness results.",
        },
      },
      logError: error,
    };
  }
}

// ---------------------------------------------------------------------------
// ping — liveness probe for the resilience preflight (no auth, no side effects)
// ---------------------------------------------------------------------------

/**
 * GET /api/readiness/ping
 *   - 200 { ok: true } — whenever the edge function is reachable.
 * A tiny connectivity check the readiness prompt tells the customer's AI to run
 * before it builds the full submission payload. No token, no DB, no side
 * effects — its only job is to confirm the edge is reachable.
 */
async function handlePing(_req: EdgeRequest): Promise<ReadinessHandlerResult> {
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
// status — poll a submission token's ingest status (waiting page)
// ---------------------------------------------------------------------------

/**
 * GET /api/readiness/status?token=<submission_token>
 *   - 200 { status: "pending" }                         — valid token, nothing landed yet
 *   - 200 { status: "ready", results, results_text }    — results landed (re-redacted)
 *   - 404 { status: "expired" }                         — unknown token
 *   - 410 { status: "expired" }                         — expired token, nothing landed
 * Results that landed before expiry stay readable after it.
 */
async function handleStatusGet(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkStatusRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const token = queryParam(req, "token").slice(0, 128);
  if (!token) {
    return {
      status: 400,
      body: {
        error: { code: "VALIDATION_ERROR", message: "A submission token is required." },
      },
    };
  }
  // A token outside the minted format can never exist: answer exactly like an
  // unknown token so the endpoint stays a simple pending/expired signal.
  if (!TOKEN_RE.test(token)) {
    return {
      status: 404,
      body: {
        status: "expired",
        error: {
          code: "NOT_FOUND",
          message: "The submission token is unknown or expired.",
        },
      },
    };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    const upstream = await proxyGetStatus(token, process.env, req.headers);
    // Pass through genuine expired signals; a 404/410 WITHOUT our expired
    // marker means the upstream route is not deployed yet — report temporary
    // unavailability instead so the waiting page keeps polling.
    if (upstream.status === 404 || upstream.status === 410) {
      const marker = typeof upstream.body.status === "string" ? upstream.body.status : "";
      const code = (upstream.body.error as { code?: string } | undefined)?.code ?? "";
      if (marker === "expired" || code === "NOT_FOUND" || code === "EXPIRED_TOKEN") {
        return upstream;
      }
      return {
        status: 503,
        body: {
          error: {
            code: "UNAVAILABLE",
            message: "Service temporarily unavailable. Please try again later.",
          },
        },
      };
    }
    return upstream;
  }

  try {
    const sql = getSql(url);
    await ensureSubmissionTables(sql);

    const tokenRows = await sql<{ token: string; expires_at: Date | string }[]>`
      SELECT token, expires_at
      FROM readiness_ingest_tokens
      WHERE token = ${token}
      LIMIT 1
    `;
    const tokenRow = tokenRows[0];
    if (!tokenRow) {
      return {
        status: 404,
        body: {
          status: "expired",
          error: {
            code: "NOT_FOUND",
            message: "The submission token is unknown or expired.",
          },
        },
      };
    }

    const expiresAtIso = new Date(tokenRow.expires_at).toISOString();

    const submissionRows = await sql<{ payload: unknown; received_at: Date | string }[]>`
      SELECT payload, received_at
      FROM readiness_ingest_submissions
      WHERE token = ${token}
      ORDER BY received_at DESC
      LIMIT 1
    `;
    const submission = submissionRows[0];

    if (!submission) {
      if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
        return {
          status: 410,
          body: {
            status: "expired",
            error: {
              code: "EXPIRED_TOKEN",
              message: "The submission token is unknown or expired.",
            },
          },
        };
      }
      return {
        status: 200,
        body: { token, status: "pending", expires_at: expiresAtIso },
      };
    }

    const payload =
      submission.payload &&
      typeof submission.payload === "object" &&
      !Array.isArray(submission.payload)
        ? (submission.payload as Record<string, unknown>)
        : {};
    // Re-redact on read-back so a planted secret in the raw ingest payload
    // never echoes back to the page.
    const resultsText =
      typeof payload.results_text === "string"
        ? edgeRedactSecrets(payload.results_text).redacted
        : null;
    const results =
      payload.results && typeof payload.results === "object" && !Array.isArray(payload.results)
        ? (payload.results as Record<string, unknown>)
        : null;
    const receivedAt =
      submission.received_at instanceof Date
        ? submission.received_at.toISOString()
        : String(submission.received_at);

    return {
      status: 200,
      body: {
        token,
        status: "ready",
        expires_at: expiresAtIso,
        received_at: receivedAt,
        results,
        results_text: resultsText,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not read submission status.",
        },
      },
      logError: error,
    };
  }
}

// ---------------------------------------------------------------------------
// analyses (readiness analyses store — many per user, keyed by user + project)
// ---------------------------------------------------------------------------

const ANALYSES_FIELD_MAX = 512;

/** Canonical home for a legacy/unprojected single analysis (mirrors @vygo/db). */
const DEFAULT_PROJECT_IDENTIFIER = "Default project";

/**
 * Statuses that count as a COMPLETED run — a strict allowlist. Result selection
 * returns ONLY these, so a newer `pending`/`failed`/`received` run never shadows
 * (nor is ever returned as) the latest completed one. Legacy `received` rows are
 * rewritten to `completed` by the migration/backfill.
 */
const COMPLETED_STATUSES_EDGE = new Set<string>([
  "completed",
  "complete",
  "done",
  "finished",
  "success",
  "succeeded",
  "ready",
  "scored",
  "closed",
]);

function isCompletedStatusEdge(status: unknown): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return COMPLETED_STATUSES_EDGE.has(normalized);
}

/** Resolve the project a new analysis (or a lookup) should use. */
function resolveProjectIdentifierEdge(project?: string | null): string {
  const trimmed = typeof project === "string" ? project.trim() : "";
  if (!trimmed || trimmed === "unspecified") return DEFAULT_PROJECT_IDENTIFIER;
  return trimmed.slice(0, ANALYSES_FIELD_MAX);
}

function pickAnalysesField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, ANALYSES_FIELD_MAX);
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value).slice(0, ANALYSES_FIELD_MAX);
    }
  }
  return null;
}

/** Candidate structured keys and free-text patterns for (user, project). */
const ANALYSES_USER_KEYS = [
  "user",
  "user_identifier",
  "userIdentifier",
  "userId",
  "user_id",
  "email",
  "user_email",
  "userEmail",
  "contact_email",
  "contactEmail",
];
const ANALYSES_PROJECT_KEYS = [
  "project",
  "project_identifier",
  "projectIdentifier",
  "projectId",
  "project_id",
  "project_name",
  "projectName",
  "project_slug",
  "projectSlug",
  "slug",
];
const ANALYSES_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ANALYSES_PROJECT_TEXT_RE =
  /\bprojects?\b["'\s:=_-]*["']?([A-Za-z0-9][A-Za-z0-9 ._-]{0,63}?)["']?(?=[\s,.;)"'}\]]|$)/i;

function analysesPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Discover (user, project, status) for the durable analyses store from a
 * readiness ingest payload: explicit structured keys first (across the body and
 * its nested results/report/contact objects), then a free-text fallback that
 * scans the report summary / results_text / whole payload for an email and a
 * `project <name>` mention.
 */
function deriveAnalysesIdentityEdge(body: Record<string, unknown>): {
  user: string | null;
  project: string | null;
  status: string;
} {
  const results = analysesPlainObject(body.results);
  const report = analysesPlainObject(body.report);
  const contact = analysesPlainObject(body.contact);
  const candidates = [
    contact,
    results ? analysesPlainObject(results.contact) : null,
    report ? analysesPlainObject(report.contact) : null,
    body,
    results,
    report,
    analysesPlainObject(body.payload),
    analysesPlainObject(body.meta),
  ].filter((o): o is Record<string, unknown> => o != null);

  const pick = (keys: string[]): string | null => {
    for (const obj of candidates) {
      const value = pickAnalysesField(obj, keys);
      if (value) return value;
    }
    return null;
  };

  let user = pick(ANALYSES_USER_KEYS);
  let project = pick(ANALYSES_PROJECT_KEYS);

  const freeParts: string[] = [];
  const pushText = (v: unknown) => {
    if (typeof v === "string" && v.trim()) freeParts.push(v);
  };
  pushText(body.results_text);
  for (const src of [results, report]) {
    if (!src) continue;
    pushText(src.summary);
    pushText(src.results_text);
    pushText(src.project);
  }
  const freeText = freeParts.join("\n");
  let whole: string | null = null;
  const scan = (): string => {
    if (whole == null) {
      try {
        whole = JSON.stringify(body);
      } catch {
        whole = "";
      }
    }
    return `${freeText}\n${whole}`;
  };

  if (!user) {
    const m = freeText.match(ANALYSES_EMAIL_RE) ?? scan().match(ANALYSES_EMAIL_RE);
    if (m) user = m[0].slice(0, ANALYSES_FIELD_MAX);
  }
  if (!project) {
    const m = freeText.match(ANALYSES_PROJECT_TEXT_RE) ?? scan().match(ANALYSES_PROJECT_TEXT_RE);
    if (m?.[1]) project = m[1].trim().slice(0, ANALYSES_FIELD_MAX);
  }

  // Lifecycle status only — NOT the readiness `bucket`/band (a score class, not
  // a run status). A submitted analysis is a completed run unless it carries an
  // explicit lifecycle status/state.
  const status = pick(["status", "state"]) ?? "completed";
  return { user, project, status };
}

async function ensureAnalysesTablesEdge(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS analyses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_identifier text NOT NULL,
      project_identifier text NOT NULL,
      status text DEFAULT 'received' NOT NULL,
      submission jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analyses_user_project_created_idx
      ON analyses (user_identifier, project_identifier, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analyses_user_created_idx
      ON analyses (user_identifier, created_at DESC)
  `;
  // Data migration (mirrors migrations/0012_analyses_default_project.sql):
  // re-home every pre-existing analysis stored under the legacy
  // `unspecified`/blank project into 'Default project' as its first history
  // entry AND rewrite the legacy completed status `received` to the canonical
  // `completed`, preserving submission content byte-for-byte. Runs at most once
  // per process; idempotent (matches nothing after the first pass).
  if (!edgeDefaultProjectBackfilled) {
    await sql`
      UPDATE analyses
      SET project_identifier = ${DEFAULT_PROJECT_IDENTIFIER}
      WHERE project_identifier IS NULL
         OR btrim(project_identifier) = ''
         OR project_identifier = 'unspecified'
    `;
    await sql`
      UPDATE analyses
      SET status = 'completed'
      WHERE status = 'received'
    `;
    edgeDefaultProjectBackfilled = true;
  }
}

let edgeDefaultProjectBackfilled = false;

type AnalysesEdgeRow = {
  id: string;
  user_identifier: string;
  project_identifier: string;
  status: string;
  submission: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function toAnalysesPublicEdge(row: AnalysesEdgeRow): Record<string, unknown> {
  const submission =
    row.submission && typeof row.submission === "object" && !Array.isArray(row.submission)
      ? (row.submission as Record<string, unknown>)
      : {};
  const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    id: row.id,
    user: row.user_identifier,
    project: row.project_identifier,
    status: row.status,
    submission,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// run START (per-project, status-aware) + COMPLETE
//
// Replaces the old account-level "analysis already exists" singleton guard.
// A signed-in caller may ALWAYS start a new run for a project (a new, distinct
// run id every time — create, never upsert) unless that SAME project already
// has a fresh in-progress run, in which case a distinct 409 conflict is
// returned. Per-user rate limits (max starts/day, max concurrent in-progress
// runs across projects) replace the removed singleton as the abuse ceiling.
// Historical completed/failed runs never block a new start.
// ---------------------------------------------------------------------------

/** Read a positive integer override from the environment, else the default. */
function runStartEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/**
 * Per-user run-start limits. Constants (env-overridable) — never magic numbers
 * scattered in the handler. Removing the singleton guard must not permit
 * unbounded abuse, so a signed-in user is capped at:
 *   - RUN_START_MAX_PER_DAY starts per rolling 24h, AND
 *   - RUN_START_MAX_CONCURRENT in-progress runs across all their projects.
 */
const RUN_START_MAX_PER_DAY = runStartEnvInt("READINESS_START_MAX_PER_DAY", 10);
const RUN_START_MAX_CONCURRENT = runStartEnvInt("READINESS_START_MAX_CONCURRENT", 3);
/**
 * An in-progress run older than this is treated as stale: it no longer blocks a
 * new start and no longer counts against the concurrency ceiling, so a crashed
 * or abandoned run can never wedge a project permanently. The explicit COMPLETE
 * endpoint is the normal way a run leaves in-progress; this is the safety net.
 */
const RUN_STALE_MINUTES = runStartEnvInt("READINESS_RUN_STALE_MINUTES", 15);

/** Canonical status a freshly started run carries until it completes/fails. */
const RUN_IN_PROGRESS_STATUS = "in_progress";
/** Marker stamped into a run's submission so start-created rows are countable. */
const RUN_STARTED_VIA = "readiness_start";

function normalizeStatusToken(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Terminal failure statuses a run may be completed into. */
const RUN_FAILED_STATUSES_EDGE = new Set<string>([
  "failed",
  "failure",
  "error",
  "errored",
  "cancelled",
  "canceled",
  "aborted",
  "rejected",
]);

/**
 * Credential/provisioning failure states. If the run pipeline reports one of
 * these, START fails closed with a clear error and creates NO run — never a
 * half-started run and never a run proceeding without credentials.
 */
const CREDENTIAL_FAILURE_STATES = new Set<string>([
  "vault_locked",
  "consumer_not_armed",
  "vault_access_denied",
  "provisioning_failed",
  "credentials_unavailable",
  "credential_failure",
  "vault_unavailable",
  "not_provisioned",
]);

/** Body keys carrying the auth credential — stripped before a run is persisted. */
const RUN_CREDENTIAL_KEYS = [
  "submission_token",
  "token",
  "auth_token",
  "authToken",
  "session_token",
  "sessionToken",
  "authorization",
  "credential",
];

function stripCredentialFields(body: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...body };
  for (const key of RUN_CREDENTIAL_KEYS) delete clone[key];
  return clone;
}

/**
 * Extract the auth credential from a start/complete request: an
 * `Authorization: Bearer <token>` header, or a token field in the JSON body.
 * The credential is a readiness submission token (minted by
 * POST /api/readiness/token) — the app's existing capability mechanism.
 */
function extractRunCredential(req: EdgeRequest, body: Record<string, unknown>): string | null {
  const auth = req.headers["authorization"];
  const rawAuth = Array.isArray(auth) ? auth[0] : auth;
  if (typeof rawAuth === "string" && rawAuth.trim()) {
    const m = /^Bearer\s+(.+)$/i.exec(rawAuth.trim());
    const bearer = m?.[1]?.trim();
    if (bearer) return bearer.slice(0, 128);
  }
  for (const key of RUN_CREDENTIAL_KEYS) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 128);
  }
  return null;
}

/** Inspect a start payload for a credential/provisioning failure state signal. */
function detectCredentialFailureState(body: Record<string, unknown>): string | null {
  const nested = [
    analysesPlainObject(body.provisioning),
    analysesPlainObject(body.credentials),
    analysesPlainObject(body.vault),
    analysesPlainObject(body.pipeline),
  ].filter((o): o is Record<string, unknown> => o != null);

  for (const flag of ["vault_locked", "consumer_not_armed", "vault_access_denied"]) {
    if (body[flag] === true) return flag;
    for (const obj of nested) if (obj[flag] === true) return flag;
  }

  const candidates: unknown[] = [
    body.credential_state,
    body.vault_state,
    body.provisioning_state,
    body.pipeline_state,
    body.state,
    body.status_reason,
  ];
  for (const obj of nested) {
    candidates.push(obj.state, obj.status, obj.reason);
  }
  for (const c of candidates) {
    if (typeof c === "string" && CREDENTIAL_FAILURE_STATES.has(normalizeStatusToken(c))) {
      return normalizeStatusToken(c);
    }
  }
  return null;
}

/**
 * Resolve the authenticated principal (the "user" the per-user limits key on).
 * Prefer an explicit user/email identity from the payload; otherwise derive a
 * stable pseudo-identity from the credential itself, so the credential (session)
 * IS the user when no explicit identity was supplied.
 */
function resolveRunPrincipal(body: Record<string, unknown>, credential: string): string {
  const identity = deriveAnalysesIdentityEdge(body).user;
  if (identity) return identity;
  return `sess:${createHash("sha256").update(credential).digest("hex").slice(0, 24)}`;
}

type RunCredentialCheck = { ok: true } | { ok: false; result: ReadinessHandlerResult };

/** Distinct, self-documenting 401 for a missing/invalid run credential. */
function unauthenticatedRunResult(message: string): ReadinessHandlerResult {
  return {
    status: 401,
    body: {
      error: "unauthenticated",
      code: "UNAUTHENTICATED",
      message,
      how_to_authenticate: {
        step1: "POST /api/readiness/token",
        step2: "send the returned token as Authorization: Bearer <token> or body.submission_token",
      },
    },
  };
}

/** Validate the credential against the readiness ingest-token store. */
async function validateRunCredential(
  sql: Sql,
  credential: string | null,
): Promise<RunCredentialCheck> {
  if (!credential || !TOKEN_RE.test(credential)) {
    return {
      ok: false,
      result: unauthenticatedRunResult(
        "A valid session credential is required to start a run. Obtain one from POST /api/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body.",
      ),
    };
  }
  const rows = await sql<{ token: string; expires_at: Date | string }[]>`
    SELECT token, expires_at FROM readiness_ingest_tokens WHERE token = ${credential} LIMIT 1
  `;
  const row = rows[0];
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      result: unauthenticatedRunResult(
        "The session credential is unknown or expired. Obtain a fresh one from POST /api/readiness/token.",
      ),
    };
  }
  return { ok: true };
}

const RUN_START_DOCS: Record<string, unknown> = {
  ok: true,
  endpoint: "POST /api/readiness/start",
  description:
    "Start a new readiness analysis run for a project. Creates a new, distinct run id every time (never upserts). Historical completed/failed runs never block a new start; only a fresh in-progress run for the same project does.",
  authentication:
    "Required. Obtain a token from POST /api/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body. Unauthenticated requests are rejected with 401.",
  body: {
    project: "project label/identifier for this run (optional; defaults to 'Default project')",
    user: "optional user/email identity; when omitted the credential identifies the user",
  },
  responses: {
    "201": "{ ok: true, status: 'in_progress', run_id, project, analysis }",
    "401": "{ error: 'unauthenticated' } — missing/invalid credential",
    "409": "{ error: 'run_in_progress', project, run_id } — same project already running",
    "429 (concurrent)": "{ error: 'too_many_concurrent_runs', limit }",
    "429 (daily)": "{ error: 'rate_limited', limit, window: '24h' }",
    "503":
      "{ error: 'provisioning_unavailable', state } — credential/provisioning failure (fails closed)",
  },
  companion: {
    complete:
      "POST /api/readiness/complete { run_id | project, results?, results_text?, status? } — moves a run out of in-progress so the next start succeeds",
    result: "GET /api/analyses/result?user=<id>&project=<name> — latest completed run",
    list: "GET /api/analyses?user=<id>[&project=<name>] — run history",
  },
  limits: {
    maxStartsPerDay: RUN_START_MAX_PER_DAY,
    maxConcurrentRuns: RUN_START_MAX_CONCURRENT,
  },
};

/** POST start / GET usage docs. Direct Postgres only (fails closed without DB). */
async function handleStart(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET") {
    return { status: 200, body: RUN_START_DOCS };
  }

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  const body = analysesPlainObject(parsedBody.value) ?? {};

  // 1. Authentication — a valid session credential is mandatory. Reject a
  // wholly unauthenticated request up front (401) so it is never masked by a
  // transient store outage below.
  const credential = extractRunCredential(req, body);
  if (!credential) {
    return unauthenticatedRunResult(
      "A valid session credential is required to start a run. Obtain one from POST /api/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body.",
    );
  }
  const url = resolveDatabaseUrl();
  if (!url) {
    // The marketing edge has no DATABASE_URL of its own: proxy the start to the
    // Railway API (durable run store). Forward the credential in the body so the
    // upstream authenticates it even if it only arrived as a Bearer header.
    return proxyRunStart({ ...body, submission_token: credential }, process.env, req.headers);
  }

  try {
    const sql = getSql(url);
    await ensureSubmissionTables(sql);
    await ensureAnalysesTablesEdge(sql);

    const credCheck = await validateRunCredential(sql, credential);
    if (!credCheck.ok) return credCheck.result;

    // 2. Fail closed on credential/provisioning failure states — create NO run.
    const failureState = detectCredentialFailureState(body);
    if (failureState) {
      return {
        status: 503,
        body: {
          error: "provisioning_unavailable",
          code: "PROVISIONING_UNAVAILABLE",
          state: failureState,
          message:
            "Cannot start a run: the credential/provisioning pipeline is not ready. No run was created.",
        },
      };
    }

    const principal = resolveRunPrincipal(body, credential);
    const project = resolveProjectIdentifierEdge(pickAnalysesField(body, ANALYSES_PROJECT_KEYS));

    // 3. Per-project in-progress guard — a fresh run for the SAME project blocks.
    const activeSameProject = await sql<{ id: string; created_at: Date | string }[]>`
      SELECT id, created_at FROM analyses
      WHERE user_identifier = ${principal}
        AND project_identifier = ${project}
        AND status = ${RUN_IN_PROGRESS_STATUS}
        AND submission->>'started_via' = ${RUN_STARTED_VIA}
        AND created_at > now() - make_interval(mins => ${RUN_STALE_MINUTES})
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (activeSameProject[0]) {
      return {
        status: 409,
        body: {
          error: "run_in_progress",
          code: "RUN_IN_PROGRESS",
          project,
          run_id: activeSameProject[0].id,
          message: `A run is already in progress for project "${project}". Wait for it to complete (or POST /api/readiness/complete) before starting another.`,
        },
      };
    }

    // 4. Per-user concurrency ceiling across ALL projects.
    const concurrentRows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM analyses
      WHERE user_identifier = ${principal}
        AND status = ${RUN_IN_PROGRESS_STATUS}
        AND submission->>'started_via' = ${RUN_STARTED_VIA}
        AND created_at > now() - make_interval(mins => ${RUN_STALE_MINUTES})
    `;
    if ((concurrentRows[0]?.n ?? 0) >= RUN_START_MAX_CONCURRENT) {
      return {
        status: 429,
        body: {
          error: "too_many_concurrent_runs",
          code: "TOO_MANY_CONCURRENT_RUNS",
          limit: RUN_START_MAX_CONCURRENT,
          current: concurrentRows[0]?.n ?? 0,
          message: `Too many runs in progress at once (limit ${RUN_START_MAX_CONCURRENT}). Let a run finish before starting another. No run was created.`,
        },
        retryAfterSeconds: 30,
      };
    }

    // 5. Per-user rolling-day start ceiling.
    const dailyRows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM analyses
      WHERE user_identifier = ${principal}
        AND submission->>'started_via' = ${RUN_STARTED_VIA}
        AND created_at > now() - interval '24 hours'
    `;
    if ((dailyRows[0]?.n ?? 0) >= RUN_START_MAX_PER_DAY) {
      return {
        status: 429,
        body: {
          error: "rate_limited",
          code: "RATE_LIMITED",
          limit: RUN_START_MAX_PER_DAY,
          window: "24h",
          message: `Daily run-start limit reached (${RUN_START_MAX_PER_DAY} per 24h). No run was created.`,
        },
        retryAfterSeconds: 3600,
      };
    }

    // 6. Create a NEW run row (new unique id). Never upsert — historical runs
    // for this project are preserved untouched.
    const submission = {
      ...stripCredentialFields(body),
      started_via: RUN_STARTED_VIA,
      run: { started_at: new Date().toISOString(), project },
    };
    const inserted = await sql<AnalysesEdgeRow[]>`
      INSERT INTO analyses (user_identifier, project_identifier, status, submission)
      VALUES (${principal}, ${project}, ${RUN_IN_PROGRESS_STATUS}, ${JSON.stringify(submission)}::jsonb)
      RETURNING id, user_identifier, project_identifier, status, submission, created_at, updated_at
    `;
    const row = inserted[0];
    if (!row) {
      return {
        status: 500,
        body: { error: { code: "INTERNAL_ERROR", message: "Run insert returned no row." } },
      };
    }
    return {
      status: 201,
      body: {
        ok: true,
        status: RUN_IN_PROGRESS_STATUS,
        run_id: row.id,
        project: row.project_identifier,
        analysis: toAnalysesPublicEdge(row),
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

/**
 * POST /api/readiness/complete — move the caller's in-progress run out of
 * in-progress (default: completed) so the next same-project start succeeds.
 * Identify the run by `run_id`, or by `project` (latest in-progress run there).
 * Result/score payload fields are stored verbatim — no scoring changes.
 */
async function handleComplete(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    return {
      status: 415,
      body: {
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
    };
  }
  const body = analysesPlainObject(parsedBody.value) ?? {};

  const credential = extractRunCredential(req, body);
  if (!credential) {
    return unauthenticatedRunResult(
      "A valid session credential is required. Obtain one from POST /api/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body.",
    );
  }
  const url = resolveDatabaseUrl();
  if (!url) {
    // No local store on the edge: proxy the completion to the Railway API.
    return proxyRunComplete({ ...body, submission_token: credential }, process.env, req.headers);
  }

  try {
    const sql = getSql(url);
    await ensureSubmissionTables(sql);
    await ensureAnalysesTablesEdge(sql);

    const credCheck = await validateRunCredential(sql, credential);
    if (!credCheck.ok) return credCheck.result;

    const principal = resolveRunPrincipal(body, credential);
    const runId = pickAnalysesField(body, ["run_id", "runId", "id", "analysis_id", "analysisId"]);

    let row: AnalysesEdgeRow | null = null;
    if (runId && UUID_RE.test(runId)) {
      const rows = await sql<AnalysesEdgeRow[]>`
        SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
        FROM analyses WHERE id = ${runId} AND user_identifier = ${principal} LIMIT 1
      `;
      row = rows[0] ?? null;
      if (!row) {
        return {
          status: 404,
          body: {
            error: "run_not_found",
            code: "RUN_NOT_FOUND",
            message: "No run with that id was found for this user.",
          },
        };
      }
    } else {
      const project = resolveProjectIdentifierEdge(pickAnalysesField(body, ANALYSES_PROJECT_KEYS));
      const rows = await sql<AnalysesEdgeRow[]>`
        SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
        FROM analyses
        WHERE user_identifier = ${principal}
          AND project_identifier = ${project}
          AND status = ${RUN_IN_PROGRESS_STATUS}
          AND submission->>'started_via' = ${RUN_STARTED_VIA}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      row = rows[0] ?? null;
      if (!row) {
        return {
          status: 404,
          body: {
            error: "no_run_in_progress",
            code: "NO_RUN_IN_PROGRESS",
            project,
            message: `No in-progress run found for project "${project}".`,
          },
        };
      }
    }

    // Decide terminal status: completed by default; honor an explicit terminal
    // failure status. An in-progress status is never accepted here.
    let finalStatus = "completed";
    const rawStatus = pickAnalysesField(body, ["status"]);
    if (rawStatus) {
      const norm = normalizeStatusToken(rawStatus);
      if (RUN_FAILED_STATUSES_EDGE.has(norm)) finalStatus = "failed";
      else if (isCompletedStatusEdge(rawStatus)) finalStatus = "completed";
    }

    const existingSubmission = analysesPlainObject(row.submission) ?? {};
    const mergedSubmission = {
      ...existingSubmission,
      ...stripCredentialFields(body),
      started_via: RUN_STARTED_VIA,
      completed_at: new Date().toISOString(),
    };

    const updated = await sql<AnalysesEdgeRow[]>`
      UPDATE analyses
      SET status = ${finalStatus},
          submission = ${JSON.stringify(mergedSubmission)}::jsonb,
          updated_at = now()
      WHERE id = ${row.id}
      RETURNING id, user_identifier, project_identifier, status, submission, created_at, updated_at
    `;
    const done = updated[0] ?? row;
    return {
      status: 200,
      body: {
        ok: true,
        status: finalStatus,
        run_id: done.id,
        project: done.project_identifier,
        analysis: toAnalysesPublicEdge(done),
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

/** POST create / GET list. Direct Postgres when the edge is wired; else proxy. */
async function handleAnalyses(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const method = (req.method || "GET").toUpperCase();
  const url = resolveDatabaseUrl();

  if (method === "POST") {
    const contentType = contentTypeBase(req.headers);
    if (contentType && contentType !== "application/json") {
      return {
        status: 415,
        body: {
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Content-Type must be application/json.",
          },
        },
      };
    }
    const parsedBody = readJsonBody(req);
    if (!parsedBody.ok) {
      return {
        status: 400,
        body: { error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
      };
    }
    const record =
      parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
        ? (parsedBody.value as Record<string, unknown>)
        : {};
    const user = pickAnalysesField(record, [
      "user",
      "user_identifier",
      "userId",
      "user_id",
      "email",
      "user_email",
    ]);
    const project = pickAnalysesField(record, [
      "project",
      "project_identifier",
      "projectId",
      "project_id",
      "project_name",
    ]);
    if (!user) {
      return {
        status: 400,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "A user identifier (user or email) is required.",
          },
        },
      };
    }
    // A missing project stores the analysis in 'Default project' rather than
    // rejecting — an unprojected run is the legacy single-analysis case.
    const resolvedProject = resolveProjectIdentifierEdge(project);

    if (!url) return proxyCreateAnalysis(record, process.env, req.headers);

    try {
      const sql = getSql(url);
      await ensureAnalysesTablesEdge(sql);
      // A stored analysis is a completed run unless the caller says otherwise;
      // default result retrieval strictly returns the latest COMPLETED one.
      const status = pickAnalysesField(record, ["status"]) ?? "completed";
      const rows = await sql<AnalysesEdgeRow[]>`
        INSERT INTO analyses (user_identifier, project_identifier, status, submission)
        VALUES (${user}, ${resolvedProject}, ${status}, ${JSON.stringify(record)}::jsonb)
        RETURNING id, user_identifier, project_identifier, status, submission, created_at, updated_at
      `;
      const inserted = rows[0];
      if (!inserted) {
        return {
          status: 500,
          body: { error: { code: "INTERNAL_ERROR", message: "Analysis insert returned no row." } },
        };
      }
      return { status: 201, body: { ok: true, analysis: toAnalysesPublicEdge(inserted) } };
    } catch (error) {
      return {
        status: 500,
        body: {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred. Please try again later.",
          },
        },
        logError: error,
      };
    }
  }

  // GET list — scoped read only. A caller MUST name the exact user whose
  // analyses they are retrieving; an omitted/blank/oversized `user` scope is
  // rejected with no data. This closes the disclosure where an unscoped GET
  // returned every stored record (all users' identifiers + full payloads) and
  // makes cross-user enumeration impossible: one request only ever yields the
  // single named user's rows, and there is no unscoped / project-only path that
  // would span users.
  const user = queryParam(req, "user").trim();
  const project = queryParam(req, "project").trim() || null;

  if (!user || user.length > ANALYSES_FIELD_MAX) {
    return {
      status: 400,
      body: {
        error: {
          code: "SCOPE_REQUIRED",
          message:
            "A user scope query parameter is required to list analyses; unscoped listing is not permitted.",
        },
      },
    };
  }

  if (!url) return proxyListAnalyses({ user, project }, process.env, req.headers);

  try {
    const sql = getSql(url);
    await ensureAnalysesTablesEdge(sql);
    let rows: AnalysesEdgeRow[];
    if (project) {
      rows = await sql<AnalysesEdgeRow[]>`
        SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
        FROM analyses WHERE user_identifier = ${user} AND project_identifier = ${project}
        ORDER BY created_at DESC LIMIT 200`;
    } else {
      rows = await sql<AnalysesEdgeRow[]>`
        SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
        FROM analyses WHERE user_identifier = ${user}
        ORDER BY created_at DESC LIMIT 200`;
    }
    const analyses = rows.map(toAnalysesPublicEdge);
    return { status: 200, body: { ok: true, count: analyses.length, analyses } };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

/** GET one analysis by id. Direct Postgres when the edge is wired; else proxy. */
async function handleAnalysisGet(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const id = queryParam(req, "id");
  if (!id || !UUID_RE.test(id)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid analysis id." } },
    };
  }

  const url = resolveDatabaseUrl();
  if (!url) return proxyGetAnalysis(id, process.env, req.headers);

  try {
    const sql = getSql(url);
    await ensureAnalysesTablesEdge(sql);
    const rows = await sql<AnalysesEdgeRow[]>`
      SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
      FROM analyses WHERE id = ${id} LIMIT 1`;
    const row = rows[0];
    if (!row) {
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Analysis not found." } },
      };
    }
    return { status: 200, body: { ok: true, analysis: toAnalysesPublicEdge(row) } };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

/**
 * GET /api/analyses/result?user=<id>[&project=<name>]
 *
 * Default result retrieval: the latest COMPLETED analysis for a (user,
 * project). `project` defaults to 'Default project', so the legacy result URL
 * (`?user=<id>`) resolves the migrated single analysis until a newer run
 * completes. A newer pending/failed run never shadows the last completed one.
 */
async function handleAnalysisResult(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const user = queryParam(req, "user").trim();
  if (!user || user.length > ANALYSES_FIELD_MAX) {
    return {
      status: 400,
      body: {
        error: {
          code: "SCOPE_REQUIRED",
          message: "A user scope query parameter is required to retrieve a result.",
        },
      },
    };
  }
  const project = resolveProjectIdentifierEdge(queryParam(req, "project").trim() || null);

  const url = resolveDatabaseUrl();
  if (!url) return proxyGetAnalysisResult({ user, project }, process.env, req.headers);

  try {
    const sql = getSql(url);
    await ensureAnalysesTablesEdge(sql);
    const rows = await sql<AnalysesEdgeRow[]>`
      SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
      FROM analyses WHERE user_identifier = ${user} AND project_identifier = ${project}
      ORDER BY created_at DESC LIMIT 200`;
    const completed = rows.find((row) => isCompletedStatusEdge(row.status));
    if (!completed) {
      return {
        status: 404,
        body: {
          error: { code: "NOT_FOUND", message: "No completed analysis found for this project." },
        },
      };
    }
    return {
      status: 200,
      body: {
        ok: true,
        project,
        defaultProject: DEFAULT_PROJECT_IDENTIFIER,
        analysis: toAnalysesPublicEdge(completed),
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

// ---------------------------------------------------------------------------
// demo — idempotent, non-destructive fixture for browser-only verification
// ---------------------------------------------------------------------------

/**
 * A fixed, documented demo user whose seeded history lets an external tester
 * (browser/HTTP only) verify the whole analysis-history model end to end:
 * legacy → 'Default project' migration integrity, multi-project storage, and
 * latest-COMPLETED-per-project retrieval (a newer non-completed run never
 * shadows the completed one).
 */
const DEMO_USER = "demo@vygo.ai";
const DEMO_SECOND_PROJECT = "Project Beta";

/**
 * The legacy single-analysis payload. Retained verbatim through the migration
 * so `/api/analyses/result?user=demo@vygo.ai` (the legacy result URL) keeps
 * returning exactly this content as the latest completed run of the migrated
 * 'Default project'. Scoring fields are illustrative sample data only — the
 * fixture never runs or alters the scorer.
 */
function demoLegacySubmission(): Record<string, unknown> {
  return {
    source: "vygo_demo_fixture",
    fixture: "legacy_single_analysis",
    user: DEMO_USER,
    results_text:
      "Legacy readiness analysis for demo@vygo.ai — the single pre-migration analysis, preserved byte-for-byte as the first entry of 'Default project'.",
    results: {
      overall_score: 72,
      band: "developing",
      dimensions: { clarity: 80, evidence: 65, alignment: 71 },
    },
  };
}

/**
 * GET /api/analyses/demo (also /v1/analyses/demo)
 *
 * Idempotently seeds `demo@vygo.ai` and returns a self-describing verification
 * guide. Non-destructive: it only inserts when this demo user has no rows yet,
 * and only ever touches the dedicated demo user's namespace — real users' data
 * is never modified.
 *
 * Seeded shape:
 *   - 'Default project': a legacy analysis (oldest created_at, completed) that
 *     was inserted under the pre-migration 'unspecified' project and re-homed
 *     by the same Default-project migration, PLUS a newer non-completed
 *     (pending) run in the same project.
 *   - 'Project Beta': a distinct second project with its own completed analysis.
 */
async function handleAnalysesDemo(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) return rateLimitedResult(rl.retryAfterSeconds);

  const user = DEMO_USER;
  const url = resolveDatabaseUrl();
  if (!url) return proxyAnalysesDemo(user, process.env, req.headers);

  try {
    const sql = getSql(url);
    await ensureAnalysesTablesEdge(sql);

    // Idempotent: only seed when this demo user has no analyses yet.
    const existing = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM analyses WHERE user_identifier = ${user}
    `;
    const seeded = (existing[0]?.n ?? 0) === 0;

    if (seeded) {
      // 1) Legacy single analysis — inserted under the PRE-migration
      //    'unspecified' project with the legacy `received` status and an old
      //    created_at, then run through the SAME 0012 migration a real legacy
      //    row goes through (scoped to this user): re-homed into 'Default
      //    project' AND its legacy completed status rewritten to `completed`.
      await sql`
        INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
        VALUES (
          ${user}, 'unspecified', 'received',
          ${JSON.stringify(demoLegacySubmission())}::jsonb,
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'
        )
      `;
      await sql`
        UPDATE analyses
        SET project_identifier = ${DEFAULT_PROJECT_IDENTIFIER}
        WHERE user_identifier = ${user}
          AND (project_identifier IS NULL
               OR btrim(project_identifier) = ''
               OR project_identifier = 'unspecified')
      `;
      await sql`
        UPDATE analyses
        SET status = 'completed'
        WHERE user_identifier = ${user} AND status = 'received'
      `;

      // 2) A NEWER, non-completed run in the SAME 'Default project'. Default
      //    result retrieval must still return the completed legacy analysis (1),
      //    never this pending one.
      await sql`
        INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
        VALUES (
          ${user}, ${DEFAULT_PROJECT_IDENTIFIER}, 'pending',
          ${JSON.stringify({
            source: "vygo_demo_fixture",
            fixture: "newer_pending_run",
            results_text:
              "A newer run that is still pending; it must NOT shadow the completed legacy result.",
          })}::jsonb,
          '2024-06-01T00:00:00Z', '2024-06-01T00:00:00Z'
        )
      `;

      // 3) A DISTINCT second project so the same user holds >= 2 projects,
      //    each listed separately.
      await sql`
        INSERT INTO analyses (user_identifier, project_identifier, status, submission, created_at, updated_at)
        VALUES (
          ${user}, ${DEMO_SECOND_PROJECT}, 'completed',
          ${JSON.stringify({
            source: "vygo_demo_fixture",
            fixture: "second_project_analysis",
            results_text: "A completed analysis stored under a distinct second project.",
            results: {
              overall_score: 88,
              band: "strong",
              dimensions: { clarity: 90, evidence: 85, alignment: 89 },
            },
          })}::jsonb,
          '2024-03-01T00:00:00Z', '2024-03-01T00:00:00Z'
        )
      `;
    }

    // Read back the full seeded state (oldest-first) for a self-verifying body.
    const rows = await sql<AnalysesEdgeRow[]>`
      SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
      FROM analyses WHERE user_identifier = ${user}
      ORDER BY created_at ASC LIMIT 200
    `;
    const analyses = rows.map(toAnalysesPublicEdge);
    const projects = Array.from(new Set(rows.map((r) => r.project_identifier)));
    const enc = (s: string) => encodeURIComponent(s);

    return {
      status: 200,
      body: {
        ok: true,
        seeded,
        idempotent: true,
        user,
        defaultProject: DEFAULT_PROJECT_IDENTIFIER,
        secondProject: DEMO_SECOND_PROJECT,
        projects,
        count: analyses.length,
        analyses,
        verify: {
          legacyResult: `/api/analyses/result?user=${enc(user)}`,
          defaultProjectHistory: `/api/analyses?user=${enc(user)}&project=${enc(DEFAULT_PROJECT_IDENTIFIER)}`,
          secondProjectHistory: `/api/analyses?user=${enc(user)}&project=${enc(DEMO_SECOND_PROJECT)}`,
          allHistory: `/api/analyses?user=${enc(user)}`,
          dashboard: "/dashboard",
        },
        notes: [
          "legacyResult returns the latest COMPLETED analysis of 'Default project' — the migrated legacy analysis (oldest created_at), NOT the newer pending run.",
          "defaultProjectHistory lists both the migrated legacy analysis and the newer pending run, each with its own status and created_at.",
          "secondProjectHistory lists this user's analyses under a distinct project, separate from 'Default project'.",
          "Re-running this endpoint is non-destructive: it seeds once, then returns the existing state (seeded=false).",
        ],
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);
  const op = resolveOp(req);
  const permissiveCors = !!op && PERMISSIVE_CORS_OPS.has(op);

  if (req.method === "OPTIONS") {
    if (permissiveCors) {
      applyPermissiveCorsHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.setHeader("Access-Control-Max-Age", "600");
    } else if (origin && allowed) {
      applyBaseHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(204).end();
    return;
  }

  if (permissiveCors) {
    applyPermissiveCorsHeaders(res, origin);
  } else {
    applyBaseHeaders(res, origin && allowed ? origin : null);

    if (origin && !allowed) {
      res
        .status(403)
        .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
      return;
    }
  }

  if (!op || !ALLOWED_OPS.has(op)) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Unknown readiness operation." },
    });
    return;
  }

  // submission / brief / snapshot / status / analysis are GET; analyses accepts
  // both (POST create / GET list); score / snapshot-email / others are POST.
  const getOps = new Set([
    "submission",
    "brief",
    "snapshot",
    "status",
    "ping",
    "analysis",
    "result",
    "demo",
  ]);
  // start/run accept GET (usage docs) or POST (start a run); analyses is create/list.
  const getOrPostOps = new Set(["analyses", "start", "run"]);
  if (getOrPostOps.has(op)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      res
        .status(405)
        .json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }
  } else if (getOps.has(op)) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      res
        .status(405)
        .json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }
  } else if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  try {
    let result: ReadinessHandlerResult;
    if (op === "lead") {
      result = await handleLead(req);
    } else if (op === "email-prompt") {
      result = await handleEmailPrompt(req);
    } else if (op === "parse") {
      result = await handleParse(req);
    } else if (op === "followups") {
      result = await handleFollowups(req);
    } else if (op === "followups-answer") {
      result = await handleFollowupsAnswer(req);
    } else if (op === "score") {
      result = await handleScore(req);
    } else if (op === "score-preview") {
      result = await handleScorePreview(req);
    } else if (op === "score-e2e") {
      result = await handleScoreE2E(req);
    } else if (op === "snapshot") {
      result = await handleSnapshotGet(req);
    } else if (op === "snapshot-email") {
      result = await handleSnapshotEmail(req);
    } else if (op === "brief") {
      result = await handleBriefGet(req);
    } else if (op === "token") {
      result = await handleToken(req);
    } else if (op === "submit") {
      result = await handleSubmit(req);
    } else if (op === "status") {
      result = await handleStatusGet(req);
    } else if (op === "ping") {
      result = await handlePing(req);
    } else if (op === "analyses") {
      result = await handleAnalyses(req);
    } else if (op === "analysis") {
      result = await handleAnalysisGet(req);
    } else if (op === "result") {
      result = await handleAnalysisResult(req);
    } else if (op === "demo") {
      result = await handleAnalysesDemo(req);
    } else if (op === "start" || op === "run") {
      result = await handleStart(req);
    } else if (op === "complete") {
      result = await handleComplete(req);
    } else {
      result = await handleSubmissionGet(req);
    }

    if (result.status === 429) {
      const retryAfter =
        typeof result.retryAfterSeconds === "number" && result.retryAfterSeconds > 0
          ? result.retryAfterSeconds
          : Math.ceil(RL_WINDOW_MS / 1000);
      res.setHeader("Retry-After", String(retryAfter));
    }
    if (result.logError) {
      const message =
        result.logError instanceof Error ? result.logError.message : `readiness ${op} failed`;
      console.error(JSON.stringify({ event: `readiness_${op}_edge_error`, message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : `readiness ${op} failed`;
    console.error(JSON.stringify({ event: `readiness_${op}_edge_fatal`, message }));
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      // parse may carry large diagnostic pastes; lead/email stay well under this.
      sizeLimit: "256kb",
    },
  },
};
