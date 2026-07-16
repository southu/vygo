/**
 * Shared edge handler for readiness POST actions (Hobby function budget):
 *   POST /api/readiness/lead
 *   POST /api/readiness/email-prompt
 *   POST /api/readiness/parse
 *
 * One Vercel serverless function covers all three paths so we stay under the
 * 12-function Hobby limit. Rewrites from /v1/readiness/* still apply.
 *
 * Prefer Railway Fastify when live; fall back to session-draft / mock paths.
 * Never returns secrets. Browser traffic is same-origin on www.vygo.ai only.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  logLeadRow,
  proxyEmailPrompt,
  proxyGetSession,
  proxyLogLead,
  proxyParsePaste,
  proxyPatchSession,
  resolveDatabaseUrl,
  type ReadinessHandlerResult,
} from "../_lib/readiness.js";
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../_lib/http.js";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const ALLOWED_OPS = new Set(["lead", "email-prompt", "parse"]);

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
// parse (Stage 3 paste-back)
// ---------------------------------------------------------------------------

function edgeScanHasSecrets(text: string): { dirty: boolean; lines: number[] } {
  const patterns: RegExp[] = [
    /\bsk[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bpostgres(?:ql)?:\/\/[^/\s"'`]+:[^@\s"'`]+@/i,
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}['"]?/i,
  ];
  const lines: number[] = [];
  const parts = text.replace(/\r\n/g, "\n").split("\n");
  parts.forEach((line, idx) => {
    for (const re of patterns) {
      re.lastIndex = 0;
      if (re.test(line)) {
        lines.push(idx + 1);
        break;
      }
    }
  });
  return { dirty: lines.length > 0, lines };
}

function edgeRedact(raw: string): string {
  let out = raw;
  out = out.replace(
    /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|rediss):\/\/)[^\s"'`]+/gi,
    "$1[REDACTED]",
  );
  out = out.replace(/\bsk[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}\b/g, "[REDACTED]");
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]");
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    "[REDACTED]",
  );
  out = out.replace(
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
    "[REDACTED PRIVATE KEY]",
  );
  out = out.replace(
    /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}['"]?/gi,
    "[REDACTED]",
  );
  return out;
}

function edgePartialReport(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const known = new Set([
    "summary",
    "languages",
    "size",
    "structure",
    "frontend",
    "backend",
    "database",
    "tenancy",
    "auth",
    "authorization",
    "row_level_security",
    "environments",
    "deploys",
    "tests",
    "background_jobs",
    "integrations",
    "secrets_pattern",
    "logging",
    "error_handling",
    "pii_categories",
    "api_surface",
    "fragility_flags",
    "confidence",
  ]);
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("===") ||
      trimmed.startsWith("```")
    ) {
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!known.has(key) || !value) continue;
    fields[key] = value;
  }
  return fields;
}

function edgeFindings(report: Record<string, unknown>): string[] {
  const order: [string, string][] = [
    ["Auth", "auth"],
    ["Database", "database"],
    ["Deploy", "deploys"],
    ["Tests", "tests"],
    ["Tenancy", "tenancy"],
    ["Secrets", "secrets_pattern"],
    ["Frontend", "frontend"],
    ["Backend", "backend"],
  ];
  const out: string[] = [];
  for (const [label, key] of order) {
    const v = report[key];
    if (typeof v === "string" && v.trim() && v.toUpperCase() !== "UNKNOWN") {
      out.push(`${label}: ${v.trim()}`);
    }
    if (out.length >= 6) break;
  }
  return out;
}

function edgeStack(report: Record<string, unknown>): string {
  const parts = [report.languages, report.frontend, report.backend]
    .filter(
      (p): p is string =>
        typeof p === "string" && p.trim().length > 0 && p.toUpperCase() !== "UNKNOWN",
    )
    .map((p) => p.trim());
  return parts.length > 0 ? [...new Set(parts)].join(" · ") : "Not yet determined";
}

function edgeSize(report: Record<string, unknown>): string {
  const size = typeof report.size === "string" ? report.size.trim() : "";
  return size && size.toUpperCase() !== "UNKNOWN" ? size : "Not yet determined";
}

async function parseViaSessionDraft(
  token: string,
  paste: string,
  req: EdgeRequest,
): Promise<ReadinessHandlerResult> {
  const redacted = edgeRedact(paste).slice(0, 50_000);
  const report = edgePartialReport(paste);
  const parseStatus = Object.keys(report).length > 0 ? "partial" : "pending";
  const stack = edgeStack(report);
  const size = edgeSize(report);
  const findings = edgeFindings(report);

  const existing = await proxyGetSession(token, process.env, req.headers);
  const baseDraft =
    existing.status >= 200 &&
    existing.status < 300 &&
    existing.body.draft &&
    typeof existing.body.draft === "object" &&
    !Array.isArray(existing.body.draft)
      ? { ...(existing.body.draft as Record<string, unknown>) }
      : {};

  const draft = {
    ...baseDraft,
    pasteText: redacted,
    source: "paste",
    report,
    parseStatus,
    parseUpdatedAt: new Date().toISOString(),
  };

  const patched = await proxyPatchSession(
    token,
    { stage: "confirm", draft },
    process.env,
    req.headers,
  );

  if (patched.status >= 200 && patched.status < 300) {
    return {
      status: 200,
      body: {
        token,
        stage: "confirm",
        parseStatus,
        stack,
        size,
        findings,
        report,
        draft: patched.body.draft ?? draft,
        path: "session_draft",
      },
    };
  }

  return {
    status: 200,
    body: {
      token,
      stage: "confirm",
      parseStatus: "pending",
      stack: "Not yet determined",
      size: "Not yet determined",
      findings: [],
      report: {},
      draft,
      path: "edge_pending",
      note: "Parse endpoint pending — draft saved locally when possible.",
    },
  };
}

async function handleParse(req: EdgeRequest): Promise<ReadinessHandlerResult> {
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

  const scan = edgeScanHasSecrets(paste);
  if (scan.dirty) {
    return {
      status: 400,
      body: {
        error: { code: "SECRETS_DETECTED", message: "Remove secrets before submitting." },
        lines: scan.lines,
      },
    };
  }

  const upstream = await proxyParsePaste({ token, paste }, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) {
    return upstream;
  }
  if (upstream.status === 400 || upstream.status === 404) {
    const code = (upstream.body.error as { code?: string } | undefined)?.code;
    if (code === "SECRETS_DETECTED" || code === "VALIDATION_ERROR" || code === "NOT_FOUND") {
      return upstream;
    }
  }

  if (
    upstream.status === 404 ||
    upstream.status === 405 ||
    upstream.status === 501 ||
    upstream.status === 502 ||
    upstream.status === 503 ||
    upstream.status >= 500
  ) {
    return parseViaSessionDraft(token, paste, req);
  }

  return parseViaSessionDraft(token, paste, req);
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
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(204).end();
    return;
  }

  applyBaseHeaders(res, origin && allowed ? origin : null);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

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

  try {
    let result: ReadinessHandlerResult;
    if (op === "lead") {
      result = await handleLead(req);
    } else if (op === "email-prompt") {
      result = await handleEmailPrompt(req);
    } else {
      result = await handleParse(req);
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
