/**
 * GET /readyz — readiness surface for the marketing edge (www.vygo.ai),
 * rewritten from the static build-time stub to a live dependency check.
 *
 * The web edge is always serving (so `ready` reflects that it is up), but the
 * `database` field now reports the REAL state of the Railway-backed Postgres
 * the availability + waitlist functions read from, using the same
 * `resolveDatabaseUrl()` precedence and connection pattern:
 *
 *   - no DATABASE_URL/POSTGRES_URL configured → "not_configured"
 *   - configured and reachable (SELECT 1 + site_availability present) → "connected"
 *   - configured but unreachable / schema missing → "error"
 *
 * Previously this path served a hard-coded `"database":"not_configured"` file
 * baked at build time, so a wired database was never reflected. Now, the moment
 * an operator points the edge at Railway Postgres (DATABASE_URL reference), this
 * surface reports `database:"connected"` with no code change — mirroring the
 * Fastify API's own dependency-aware /readyz (see packages/db readiness).
 *
 * Never exposes DATABASE_URL, connection strings, SQL, or stack traces — only
 * booleans and identity/status strings.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { applyCorsAndMaybePreflight, applyHealthHeaders } from "./_lib/meta.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";
import { resolveDatabaseUrl } from "./_lib/store.js";

type DatabaseState = "not_configured" | "connected" | "error";

type ReadyBody = {
  ready: boolean;
  status: "ready";
  service: "vygo-web";
  database: DatabaseState;
  checks: {
    web: { ready: true };
    database?: { ready: boolean; status: string };
  };
};

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

/**
 * Probe Postgres the same way the Fastify API's /readyz does: liveness
 * (`SELECT 1`) plus a smoke check that the `site_availability` singleton table
 * (the audit-date source of truth) exists. Any failure degrades to "error".
 */
async function probeDatabase(url: string): Promise<DatabaseState> {
  const sql = getSql(url);
  await sql`SELECT 1`;
  await sql`SELECT 1 FROM site_availability LIMIT 1`;
  return "connected";
}

function bodyFor(database: DatabaseState): ReadyBody {
  const body: ReadyBody = {
    ready: true,
    status: "ready",
    service: "vygo-web",
    database,
    checks: { web: { ready: true } },
  };
  if (database !== "not_configured") {
    body.checks.database = {
      ready: database === "connected",
      status: database === "connected" ? "ok" : "error",
    };
  }
  return body;
}

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  if (applyCorsAndMaybePreflight(req, res)) return;
  applyHealthHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  const url = resolveDatabaseUrl();
  if (!url) {
    // Backward-compatible with the former static stub: web is up, no DB wired.
    res.status(200).json(bodyFor("not_configured"));
    return;
  }

  // Defense in depth: an unreachable DB or unexpected throw reports database:
  // "error" rather than a 5xx, so the readiness surface itself never breaks.
  try {
    const database = await probeDatabase(url);
    res.status(200).json(bodyFor(database));
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness probe failed";
    console.error(JSON.stringify({ event: "readyz_edge_error", message }));
    res.status(200).json(bodyFor("error"));
  }
}
