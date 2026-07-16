/**
 * POST /api/readiness/session — create a resumable readiness session.
 * Rewritten from POST /v1/readiness/session via vercel.json.
 *
 * Persistence: Railway Postgres readiness_sessions. Local DATABASE_URL when
 * configured; otherwise server-to-server proxy to the Railway Fastify API.
 *
 * Rate limiting: when proxying, Railway owns the counters (Redis) so we do NOT
 * double-limit here — a poisoned in-process Map was permanently 429'ing create
 * on shared warm isolates. Edge-only RL applies when this function writes DB
 * itself (no upstream hop).
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { createHash } from "node:crypto";
import {
  createSessionRow,
  parseSessionBody,
  proxyCreateSession,
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
 * Coarse in-process rate limit used ONLY for the local-DB path (per warm isolate).
 * Aligns with Railway readiness budget: ~20 ops / 60s, never a 1-hour lockout.
 * Proxy path does not double-limit — Railway Redis owns counters.
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
  // Prefix isolates readiness create from other edge handlers sharing process state.
  // Include a coarse time shard for the "unknown" key so multi-tenant traffic on a
  // single warm isolate cannot permanently exhaust one global bucket.
  const ipPart = createHash("sha256").update(String(raw)).digest("hex").slice(0, 32);
  if (raw === "unknown") {
    const shard = Math.floor(Date.now() / RL_WINDOW_MS);
    return `readiness:create:${ipPart}:t${shard}`;
  }
  return `readiness:create:${ipPart}`;
}

function checkEdgeRateLimit(req: EdgeRequest): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientBucketKey(req);
  const now = Date.now();
  const existing = rlBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    rlBuckets.set(key, { count: 1, expiresAt: now + RL_WINDOW_MS });
    // Opportunistic prune of expired entries to avoid unbounded Map growth.
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

  const parsed = parseSessionBody(parsedBody.value);
  if (!parsed.ok) {
    return { status: parsed.status, body: parsed.body };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    // Proxy path: Railway Fastify enforces rate limits. Do not double-limit
    // here — the prior in-process Map was shared across multi-tenant traffic
    // and permanently blocked POST create while token routes still worked.
    return proxyCreateSession(
      {
        stage: parsed.stage,
        draft: parsed.draft,
      },
      process.env,
      req.headers,
    );
  }

  // Local DB path: no Railway hop, so apply coarse edge RL.
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
      retryAfterSeconds: rl.retryAfterSeconds,
    };
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
      const retryAfter =
        typeof result.retryAfterSeconds === "number" && result.retryAfterSeconds > 0
          ? result.retryAfterSeconds
          : Math.ceil(RL_WINDOW_MS / 1000);
      res.setHeader("Retry-After", String(retryAfter));
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
