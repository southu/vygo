/**
 * GET /api/apply/:id — read-back for a stored applications row.
 * Persistence is Railway Postgres via direct DATABASE_URL or Railway API proxy.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  findApplicationRow,
  isUuid,
  proxyApplyGet,
  resolveDatabaseUrl,
  type ApplyHandlerResult,
} from "../_lib/apply.js";
import {
  evaluateOrigin,
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

async function handleGet(idRaw: string): Promise<ApplyHandlerResult> {
  const id = idRaw.trim();
  if (!id || !isUuid(id)) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid application id." } },
    };
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    return proxyApplyGet(id);
  }

  try {
    const sql = getSql(url);
    const row = await findApplicationRow(sql, id);
    if (!row) {
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Application not found." } },
      };
    }
    return { status: 200, body: row };
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
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(204).end();
    return;
  }

  applyBaseHeaders(res, origin && allowed ? origin : null);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  const query = (req as EdgeRequest & { query?: Record<string, string | string[] | undefined> })
    .query;
  // Vercel dynamic segment: req.query.id
  const raw = query?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (!id || typeof id !== "string") {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid application id." } });
    return;
  }

  try {
    const result = await handleGet(id);
    if (result.logError) {
      const message =
        result.logError instanceof Error ? result.logError.message : "apply get failed";
      console.error(JSON.stringify({ event: "apply_edge_get_error", message }));
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "apply get fatal";
    console.error(JSON.stringify({ event: "apply_edge_get_fatal", message }));
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  }
}
