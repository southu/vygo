/**
 * GET/PATCH /api/readiness/session/:token — resume or update draft/stage.
 * Rewritten from /v1/readiness/session/:token via vercel.json.
 *
 * Rate limiting: when proxying, Railway owns the counters. Edge RL only applies
 * on the local-DB path so we do not double-limit and poison multi-tenant Maps.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { createHash } from "node:crypto";
import {
  findSessionRow,
  isValidReadinessToken,
  parseSessionBody,
  patchSessionRow,
  proxyGetSession,
  proxyPatchSession,
  resolveDatabaseUrl,
  resolveEdgeClientIp,
  type ReadinessHandlerResult,
} from "../../_lib/readiness.js";
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "../../_lib/http.js";

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;

/**
 * Coarse in-process rate limit for the local-DB path only.
 * Shared budget with create (same window/limit class) so resume cannot be
 * locked while create still works. Proxy path: Railway owns counters.
 */
const rlBuckets = new Map<string, { count: number; expiresAt: number }>();
const RL_LIMIT = 20;
const RL_WINDOW_MS = 60 * 1000;

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

function clientBucketKey(req: EdgeRequest): string {
  const raw = resolveEdgeClientIp(req.headers) || "unknown";
  const ipPart = createHash("sha256").update(String(raw)).digest("hex").slice(0, 32);
  if (raw === "unknown") {
    const shard = Math.floor(Date.now() / RL_WINDOW_MS);
    return `readiness:token:${ipPart}:t${shard}`;
  }
  return `readiness:token:${ipPart}`;
}

function checkEdgeRateLimit(req: EdgeRequest): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientBucketKey(req);
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

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

function tokenFromReq(req: EdgeRequest): string {
  // Vercel dynamic segment is available on query for pages router style.
  const q = (req as EdgeRequest & { query?: Record<string, string | string[]> }).query;
  const raw = q?.token;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

async function maybeEdgeRateLimit(req: EdgeRequest): Promise<ReadinessHandlerResult | null> {
  // Only when this function talks to Postgres directly (no Railway hop).
  if (!resolveDatabaseUrl()) return null;
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) {
    return {
      status: 429,
      body: {
        error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." },
      },
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }
  return null;
}

async function handleGet(req: EdgeRequest, token: string): Promise<ReadinessHandlerResult> {
  const limited = await maybeEdgeRateLimit(req);
  if (limited) return limited;

  if (!isValidReadinessToken(token)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid session token." } },
    };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    return proxyGetSession(token, process.env, req.headers);
  }
  try {
    const sql = getSql(url);
    const session = await findSessionRow(sql, token);
    if (!session) {
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Session not found." } },
      };
    }
    return { status: 200, body: session as unknown as Record<string, unknown> };
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

async function handlePatch(req: EdgeRequest, token: string): Promise<ReadinessHandlerResult> {
  const limited = await maybeEdgeRateLimit(req);
  if (limited) return limited;

  if (!isValidReadinessToken(token)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid session token." } },
    };
  }

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
  const parsed = parseSessionBody(parsedBody.value);
  if (!parsed.ok) {
    return { status: parsed.status, body: parsed.body };
  }
  if (parsed.stage === undefined && parsed.draft === undefined) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide stage and/or draft to update.",
        },
      },
    };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    return proxyPatchSession(
      token,
      { stage: parsed.stage, draft: parsed.draft },
      process.env,
      req.headers,
    );
  }
  try {
    const sql = getSql(url);
    const session = await patchSessionRow(sql, token, {
      stage: parsed.stage,
      draft: parsed.draft,
    });
    if (!session) {
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Session not found." } },
      };
    }
    return { status: 200, body: session as unknown as Record<string, unknown> };
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

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);

  if (req.method === "OPTIONS") {
    if (origin && allowed) {
      applyBaseHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
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

  const token = tokenFromReq(req);

  try {
    let result: ReadinessHandlerResult;
    if (req.method === "GET") {
      result = await handleGet(req, token);
    } else if (req.method === "PATCH") {
      result = await handlePatch(req, token);
    } else {
      res.setHeader("Allow", "GET, PATCH, OPTIONS");
      res
        .status(405)
        .json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
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
        result.logError instanceof Error ? result.logError.message : "readiness token failed";
      console.error(JSON.stringify({ event: "readiness_session_token_edge_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness token failed";
    console.error(JSON.stringify({ event: "readiness_session_token_edge_fatal", message }));
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
