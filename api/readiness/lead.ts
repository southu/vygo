/**
 * POST /api/readiness/lead — log readiness off-ramp / intake lead.
 * Rewritten from POST /v1/readiness/lead via vercel.json.
 *
 * Prefer local DATABASE_URL; otherwise proxy server-to-server to Railway API.
 * If Railway has not yet deployed the lead route, fall back to patching the
 * existing readiness session draft (still durable server-side) and return 2xx.
 * Never returns secrets. Always same-origin for browsers (www.vygo.ai).
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  logLeadRow,
  proxyGetSession,
  proxyLogLead,
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

/**
 * Durable fallback when /v1/readiness/lead is not yet on Railway:
 * merge off-ramp into the session draft via the existing session API.
 */
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

  // Structured server log (no secrets / no full free-text product description).
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

  // Session missing or patch failed — still accept so the client off-ramp is not blocked.
  return {
    status: 201,
    body: { accepted: true, id: `edge-lead-${Date.now()}`, path: "edge_log" },
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

  // Prefer Railway when the lead route is live.
  const proxied = await proxyLogLead(
    { reason, token, email, answers },
    process.env,
    req.headers,
  );
  if (proxied.status >= 200 && proxied.status < 300) {
    return proxied;
  }
  // Railway not yet deployed or transient failure — durable session-draft fallback.
  if (proxied.status === 404 || proxied.status >= 500) {
    return logLeadViaSessionDraft({ token, reason, answers, email }, req);
  }
  return proxied;
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
        result.logError instanceof Error ? result.logError.message : "readiness lead failed";
      console.error(JSON.stringify({ event: "readiness_lead_edge_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness lead failed";
    console.error(JSON.stringify({ event: "readiness_lead_edge_fatal", message }));
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
      sizeLimit: "64kb",
    },
  },
};
