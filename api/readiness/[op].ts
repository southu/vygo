/**
 * Shared edge handler for readiness POST/GET actions (Hobby function budget):
 *   POST /api/readiness/lead
 *   POST /api/readiness/email-prompt
 *   POST /api/readiness/parse
 *   POST /api/readiness/followups
 *   POST /api/readiness/followups/answer  (op: followups-answer)
 *   GET  /api/readiness/submission
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
import { createHash } from "node:crypto";
import {
  logLeadRow,
  proxyEmailPrompt,
  proxyFollowups,
  proxyFollowupsAnswer,
  proxyGetSession,
  proxyGetSubmission,
  proxyLogLead,
  proxyParsePaste,
  proxyPatchSession,
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
const ALLOWED_OPS = new Set([
  "lead",
  "email-prompt",
  "parse",
  "followups",
  "followups-answer",
  "submission",
]);

/** Shared readiness edge rate-limit budget (aligns with Railway ~20/60s). */
const rlBuckets = new Map<string, { count: number; expiresAt: number }>();
const RL_LIMIT = 20;
const RL_WINDOW_MS = 60 * 1000;

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
}

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
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
  console.info(
    JSON.stringify({
      event: "readiness_prompt_email_queued_edge_fallback",
      hasToken: true,
      mock: true,
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
      policy: "mock_outbox_pending_railway",
    };
    await proxyPatchSession(input.token, { draft }, process.env, req.headers);
  }

  return {
    status: 202,
    body: {
      accepted: true,
      queued: true,
      mock: true,
      resumeUrl,
      path: "edge_mock_outbox",
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

  const discrepancyFlags = dbRow
    ? Array.isArray(dbRow.discrepancy_flags)
      ? dbRow.discrepancy_flags
      : []
    : Array.isArray(draft.discrepancyFlags)
      ? draft.discrepancyFlags
      : [];

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
// HTTP entry
// ---------------------------------------------------------------------------

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);
  const op = resolveOp(req);

  if (req.method === "OPTIONS") {
    if (origin && allowed) {
      applyBaseHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(204).end();
    return;
  }

  applyBaseHeaders(res, origin && allowed ? origin : null);

  if (origin && !allowed) {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
    return;
  }

  if (!op || !ALLOWED_OPS.has(op)) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Unknown readiness operation." },
    });
    return;
  }

  // submission is GET; all other ops are POST
  if (op === "submission") {
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
