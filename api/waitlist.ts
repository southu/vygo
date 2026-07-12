/**
 * POST /api/waitlist — public waitlist intake served on the marketing edge
 * (www.vygo.ai). The site's `vercel.json` rewrites the documented
 * `POST /v1/waitlist` path to this function, so the marketing form persists
 * directly to Postgres from the static deployment.
 *
 * Responsibilities: method/CORS/content-type gating, JSON parsing, then the
 * shared handler (validation + idempotent upsert + sanitized errors). No
 * credentials, connection strings, SQL, or stack traces ever reach a response.
 *
 * Production migration command (documented): `DATABASE_URL=… pnpm db:migrate`.
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
import { createPgStore, resolveDatabaseUrl, type WaitlistStore } from "./_lib/store.js";

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;

/** Reuse one small pool across warm invocations; null when no DB is configured. */
function getStore(): WaitlistStore | null {
  const url = resolveDatabaseUrl();
  if (!url) return null;
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
