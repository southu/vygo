/**
 * POST /api/readiness/parse — stage 3 paste-back parse.
 * Rewritten from POST /v1/readiness/parse via vercel.json.
 *
 * Prefer proxy to Railway Fastify (full parse + submission). If the upstream
 * route is not yet live (404/405/501/502/503), fall back to redacting the paste
 * into the session draft and returning a graceful pending/partial response so
 * the Stage 3 confirmation UI stays fully usable.
 *
 * Never returns secrets. Browser traffic is same-origin on www.vygo.ai only.
 */
import {
  proxyGetSession,
  proxyParsePaste,
  proxyPatchSession,
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

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Lightweight edge secret check (mirrors high-confidence client patterns).
 * Avoids importing the full validation package into the edge function graph.
 */
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

/** Best-effort field extraction without the full validation package. */
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
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("===") || trimmed.startsWith("```")) {
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

/**
 * When Railway parse is not deployed yet, store redacted paste on the session
 * draft so resume still works and the confirmation UI can show partial data.
 */
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

  // Even if patch fails, return a pending confirmation payload so UI is usable.
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

async function handlePost(req: EdgeRequest): Promise<ReadinessHandlerResult> {
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

  // Prefer full Railway parse when live.
  const upstream = await proxyParsePaste({ token, paste }, process.env, req.headers);
  if (upstream.status >= 200 && upstream.status < 300) {
    return upstream;
  }
  // Secrets / validation errors from upstream should surface.
  if (upstream.status === 400 || upstream.status === 404) {
    // 404 session not found — surface; 404 route missing may also happen as 404.
    // If body has SECRETS_DETECTED or VALIDATION, surface it.
    const code = (upstream.body.error as { code?: string } | undefined)?.code;
    if (code === "SECRETS_DETECTED" || code === "VALIDATION_ERROR" || code === "NOT_FOUND") {
      return upstream;
    }
  }

  // Graceful pending path when parse route is not fully live yet.
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

  // Other 4xx: still try draft fallback so confirmation UI is not blocked.
  return parseViaSessionDraft(token, paste, req);
}

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);

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

  try {
    const result = await handlePost(req);
    if (result.logError) {
      const message =
        result.logError instanceof Error ? result.logError.message : "readiness parse failed";
      console.error(JSON.stringify({ event: "readiness_parse_edge_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness parse failed";
    console.error(JSON.stringify({ event: "readiness_parse_edge_fatal", message }));
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
      sizeLimit: "256kb",
    },
  },
};
