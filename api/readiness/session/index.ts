/**
 * POST /api/readiness/session — create a resumable readiness session.
 * Rewritten from POST /v1/readiness/session via vercel.json.
 *
 * Persistence: Railway Postgres readiness_sessions. Local DATABASE_URL when
 * configured; otherwise server-to-server proxy to the Railway Fastify API.
 * Rate limiting is enforced on the Railway API; edge also applies a coarse
 * in-process limit so abuse is rejected even before the proxy hop.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { createHash } from "node:crypto";
import {
  createSessionRow,
  parseSessionBody,
  proxyCreateSession,
  resolveDatabaseUrl,
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

/** Coarse in-process rate limit (per warm isolate). */
const rlBuckets = new Map<string, { count: number; expiresAt: number }>();
const RL_LIMIT = 20;
const RL_WINDOW_MS = 60 * 60 * 1000;

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
  const xff = req.headers["x-forwarded-for"];
  const raw =
    (typeof xff === "string" && xff.split(",")[0]?.trim()) ||
    (typeof req.headers["x-real-ip"] === "string" && req.headers["x-real-ip"]) ||
    "unknown";
  return createHash("sha256").update(String(raw)).digest("hex").slice(0, 32);
}

function checkEdgeRateLimit(req: EdgeRequest): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientBucketKey(req);
  const now = Date.now();
  const existing = rlBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    rlBuckets.set(key, { count: 1, expiresAt: now + RL_WINDOW_MS });
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

async function handlePost(req: EdgeRequest): Promise<ReadinessHandlerResult> {
  const rl = checkEdgeRateLimit(req);
  if (!rl.allowed) {
    return {
      status: 429,
      body: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many attempts. Please try again later.",
        },
      },
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

  const parsed = parseSessionBody(parsedBody.value);
  if (!parsed.ok) {
    return { status: parsed.status, body: parsed.body };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    return proxyCreateSession(
      {
        stage: parsed.stage,
        draft: parsed.draft,
      },
      process.env,
      req.headers,
    );
  }

  try {
    const sql = getSql(url);
    const session = await createSessionRow(sql, {
      stage: parsed.stage,
      draft: parsed.draft,
    });
    return { status: 201, body: session as unknown as Record<string, unknown> };
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

  // Server-to-server (no Origin) and allowlisted browser origins are accepted.
  if (origin && !allowed) {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
    return;
  }

  try {
    const result = await handlePost(req);
    if (result.status === 429) {
      res.setHeader("Retry-After", "3600");
    }
    if (result.logError) {
      const message =
        result.logError instanceof Error ? result.logError.message : "readiness create failed";
      console.error(JSON.stringify({ event: "readiness_session_edge_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness create failed";
    console.error(JSON.stringify({ event: "readiness_session_edge_fatal", message }));
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
