/**
 * GET /api/health (also /health) and worker status (rewritten worker paths).
 *
 * Single Hobby-budget serverless function covering both thin identity surfaces
 * so dedicated routes (e.g. POST /api/analytics) stay within the 12-function
 * Vercel Hobby limit. Query `?role=worker` selects the worker payload; otherwise
 * the API health payload is returned.
 *
 * The API payload additionally reports the analyses-database connection state.
 * The marketing edge (www.vygo.ai) has no DATABASE_URL of its own, so — like
 * /readyz — it reflects the analyses DB readiness of the upstream Railway API
 * (which reads Railway Postgres). When a local DATABASE_URL is wired to the
 * edge it is probed directly instead.
 *
 * Never exposes DATABASE_URL, REDIS_URL, Resend/Turnstile secrets, connection
 * strings, or applicant data — only booleans and identity strings.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { applyCorsAndMaybePreflight, applyHealthHeaders, deployedGitSha } from "./_lib/meta.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";
import { resolveDatabaseUrl, resolveUpstreamApiOrigin } from "./_lib/store.js";

type EdgeReqEx = EdgeRequest & {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
};

type DatabaseState = "not_configured" | "connected" | "error";
type DatabaseSource = "edge-postgres" | "railway-api";

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function queryParam(req: EdgeReqEx, name: string): string {
  const q = req.query ?? {};
  const raw = q[name];
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  if (typeof raw === "string") return raw;
  if (typeof req.url === "string" && req.url.includes("?")) {
    try {
      const u = new URL(req.url, "https://www.vygo.ai");
      return u.searchParams.get(name) ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

function wantsWorkerSurface(req: EdgeReqEx): boolean {
  if (queryParam(req, "role").trim().toLowerCase() === "worker") return true;
  const url = typeof req.url === "string" ? req.url : "";
  if (/worker/i.test(url.split("?")[0] || "")) return true;
  const matched =
    headerValue(req.headers["x-matched-path"]) || headerValue(req.headers["x-invoke-path"]) || "";
  if (/worker/i.test(matched)) return true;
  return false;
}

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;

function getSql(url: string): Sql {
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false });
    cachedUrl = url;
  }
  return cachedSql;
}

/** Probe local Postgres: liveness + the analyses table is reachable. */
async function probeAnalysesDatabase(url: string): Promise<DatabaseState> {
  try {
    const sql = getSql(url);
    await sql`SELECT 1`;
    await sql`SELECT 1 FROM analyses LIMIT 1`;
    return "connected";
  } catch {
    return "error";
  }
}

/**
 * Reflect the analyses DB readiness of the upstream Railway API when this edge
 * has no local DATABASE_URL. Prefers the dedicated /v1/analyses/health surface
 * and falls back to /readyz. Unreachable degrades to "not_configured"; reachable
 * but not-ready degrades to "error" — never a false "connected".
 */
async function probeUpstreamAnalyses(origin: string): Promise<DatabaseState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${origin}/v1/analyses/health`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.ok) {
      const body = (await res.json()) as { database?: unknown; ok?: unknown; analyses?: unknown };
      if (body?.database === "ok" || body?.database === "connected" || body?.analyses === true) {
        return "connected";
      }
      if (body?.database === "not_configured") return "not_configured";
      return "error";
    }
  } catch {
    // fall through to /readyz reflection below
  } finally {
    clearTimeout(timer);
  }

  const controller2 = new AbortController();
  const timer2 = setTimeout(() => controller2.abort(), 4000);
  try {
    const res = await fetch(`${origin}/readyz`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller2.signal,
    });
    if (!res.ok) return "error";
    const body = (await res.json()) as { database?: unknown };
    if (body?.database === "ok" || body?.database === "connected") return "connected";
    return "error";
  } catch {
    return "not_configured";
  } finally {
    clearTimeout(timer2);
  }
}

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  if (applyCorsAndMaybePreflight(req, res)) return;
  applyHealthHeaders(res);

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  const commit = deployedGitSha();
  if (wantsWorkerSurface(req as EdgeReqEx)) {
    res.status(200).json({
      ok: true,
      running: true,
      ready: true,
      status: "running",
      service: "vygo-worker",
      process: "worker",
      role: "email-outbox-worker",
      commit: commit || undefined,
    });
    return;
  }

  // Analyses DB connection state — probed directly when the edge has a local
  // DATABASE_URL, otherwise reflected from the upstream Railway API. Defense in
  // depth: any failure degrades to a status field, never a 5xx, so /api/health
  // stays a stable 200 identity surface.
  let database: DatabaseState = "not_configured";
  let databaseSource: DatabaseSource | undefined;
  try {
    const url = resolveDatabaseUrl();
    if (url) {
      database = await probeAnalysesDatabase(url);
      databaseSource = "edge-postgres";
    } else {
      database = await probeUpstreamAnalyses(resolveUpstreamApiOrigin());
      if (database !== "not_configured") databaseSource = "railway-api";
    }
  } catch {
    database = "error";
  }

  const analysesReady = database === "connected";

  res.status(200).json({
    ok: true,
    healthy: true,
    status: "healthy",
    service: "vygo-api",
    process: "api",
    role: "http-api",
    commit: commit || undefined,
    database,
    ...(databaseSource ? { databaseSource } : {}),
    analyses: { ready: analysesReady, status: analysesReady ? "ok" : "not_ready" },
    checks: {
      api: { ready: true },
      database: { ready: analysesReady, status: analysesReady ? "ok" : database },
      analyses: { ready: analysesReady, status: analysesReady ? "ok" : "not_ready" },
    },
  });
}
