/**
 * POST /api/waitlist — public waitlist intake served on the marketing edge
 * (www.vygo.ai). The site's `vercel.json` rewrites the documented
 * `POST /v1/waitlist` path to this function.
 *
 * Persistence: a committed row in Railway Postgres `applications` is required
 * before any accepted:true response. When this edge has a local DATABASE_URL it
 * writes directly; otherwise it proxies server-to-server to the Railway API
 * apply route (same production Postgres). Never acknowledges from memory alone.
 *
 * Responsibilities: method/CORS/content-type gating, JSON parsing, then the
 * shared handler (validation + durable upsert + sanitized errors). No
 * credentials, connection strings, SQL, or stack traces ever reach a response.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { handleWaitlist } from "./_lib/handler.js";
import {
  contentTypeBase,
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "./_lib/http.js";
import {
  createPgStore,
  createUpstreamApplyStore,
  resolveDatabaseUrl,
  type WaitlistStore,
} from "./_lib/store.js";

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;
let warnedNoDatabase = false;

/**
 * Resolve durable persistence for this invocation. Local Postgres when
 * DATABASE_URL is set; otherwise Railway API proxy that commits `applications`.
 * Never uses the in-memory test store in production.
 */
function getStore(): WaitlistStore {
  const url = resolveDatabaseUrl();
  if (!url) {
    if (!warnedNoDatabase) {
      warnedNoDatabase = true;
      console.warn(
        JSON.stringify({
          event: "waitlist_edge_no_database",
          message:
            "DATABASE_URL not configured; proxying waitlist intake to Railway apply for durable applications rows",
        }),
      );
    }
    return createUpstreamApplyStore();
  }
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    cachedUrl = url;
  }
  return createPgStore(cachedSql);
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

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);

  // CORS preflight for cross-origin form posts.
  if (req.method === "OPTIONS") {
    if (origin && allowed) {
      applyBaseHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
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

  // Reject cross-origin browser posts from disallowed origins. A request with no
  // Origin header (server-to-server) is allowed by evaluateOrigin.
  if (!allowed) {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed." } });
    return;
  }

  const contentType = contentTypeBase(req.headers);
  if (contentType && contentType !== "application/json") {
    res.status(415).json({
      error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
    });
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    res
      .status(400)
      .json({ error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } });
    return;
  }

  // Defense in depth: any unexpected throw (e.g. a malformed connection string
  // in the pg client constructor) collapses to a sanitized 500 — never Vercel's
  // default error page or a leaked internal detail.
  try {
    const result = await handleWaitlist(getStore(), parsedBody.value);

    if (result.logError) {
      // Server-side log only — never serialized into the response body.
      const message =
        result.logError instanceof Error ? result.logError.message : "waitlist persistence failed";
      console.error(JSON.stringify({ event: "waitlist_edge_error", message }));
    }

    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "waitlist handler failed";
    console.error(JSON.stringify({ event: "waitlist_edge_fatal", message }));
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  }
}
