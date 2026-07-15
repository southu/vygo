/**
 * GET /readyz — readiness surface for the marketing edge (www.vygo.ai),
 * rewritten from the static build-time stub to a live dependency check.
 *
 * The web edge is always serving (so `ready` reflects that it is up), but the
 * `database` field now reports the REAL state of the Railway-backed Postgres the
 * audit-date data ultimately comes from:
 *
 *   - a local DATABASE_URL wired to this edge → probe it directly
 *     (SELECT 1 + site_availability present) → "connected" / "error"
 *   - otherwise → reflect the UPSTREAM Railway API's `/readyz` (it reads Railway
 *     Postgres): its `database:"ok"` → "connected" (databaseSource:"railway-api");
 *     reachable-but-not-ready → "error"; unreachable → "not_configured"
 *
 * Previously this path served a hard-coded `"database":"not_configured"` file
 * baked at build time, so a wired database was never reflected. Now the web
 * tier's readiness honestly tracks the Postgres-backed availability source —
 * whether that Postgres is reached directly or through the Railway API.
 *
 * Never exposes DATABASE_URL, connection strings, SQL, or stack traces — only
 * booleans and identity/status strings.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { applyCorsAndMaybePreflight, applyHealthHeaders } from "./_lib/meta.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";
import { resolveDatabaseUrl, resolveUpstreamApiOrigin } from "./_lib/store.js";

type DatabaseState = "not_configured" | "connected" | "error";
type DatabaseSource = "edge-postgres" | "railway-api";

type ReadyBody = {
  ready: boolean;
  status: "ready";
  service: "vygo-web";
  database: DatabaseState;
  databaseSource?: DatabaseSource;
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

/**
 * Reflect the database readiness of the UPSTREAM Railway API when this edge has
 * no local DATABASE_URL. The web tier's availability data dependency is that API
 * (which reads Railway Postgres), so its `database:"ok"` is the honest readiness
 * of the audit-date data source. Any failure to reach it degrades to
 * "not_configured" (unreachable) or "error" (reachable but DB not ready) rather
 * than falsely reporting "connected".
 */
async function probeUpstream(origin: string): Promise<DatabaseState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const upstream = await fetch(`${origin}/readyz`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!upstream.ok) return "error";
    const body = (await upstream.json()) as { database?: unknown; ready?: unknown };
    if (body?.database === "ok" || body?.database === "connected") return "connected";
    return "error";
  } catch {
    return "not_configured";
  } finally {
    clearTimeout(timer);
  }
}

function bodyFor(database: DatabaseState, source?: DatabaseSource): ReadyBody {
  const body: ReadyBody = {
    ready: true,
    status: "ready",
    service: "vygo-web",
    database,
    checks: { web: { ready: true } },
  };
  if (database !== "not_configured") {
    if (source) body.databaseSource = source;
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

  // Defense in depth: an unreachable DB or unexpected throw reports a degraded
  // database state rather than a 5xx, so the readiness surface never breaks.
  try {
    if (url) {
      // Local Postgres wired directly to this edge.
      res.status(200).json(bodyFor(await probeDatabase(url), "edge-postgres"));
      return;
    }
    // No local DB: reflect the upstream Railway API's Postgres readiness, which
    // is the actual source of the audit-date data the web tier serves.
    const database = await probeUpstream(resolveUpstreamApiOrigin());
    res
      .status(200)
      .json(bodyFor(database, database === "not_configured" ? undefined : "railway-api"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "readiness probe failed";
    console.error(JSON.stringify({ event: "readyz_edge_error", message }));
    res.status(200).json(bodyFor("error"));
  }
}
