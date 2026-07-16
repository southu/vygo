/**
 * GET /api/health (also /health) and worker status (rewritten worker paths).
 *
 * Single Hobby-budget serverless function covering both thin identity surfaces
 * so dedicated routes (e.g. POST /api/analytics) stay within the 12-function
 * Vercel Hobby limit. Query `?role=worker` selects the worker payload; otherwise
 * the API health payload is returned.
 *
 * Never exposes DATABASE_URL, REDIS_URL, Resend/Turnstile secrets, connection
 * strings, or applicant data — only booleans and identity strings.
 */
import { applyCorsAndMaybePreflight, applyHealthHeaders, deployedGitSha } from "./_lib/meta.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";

type EdgeReqEx = EdgeRequest & {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
};

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

export default function handler(req: EdgeRequest, res: EdgeResponse): void {
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

  res.status(200).json({
    ok: true,
    healthy: true,
    status: "healthy",
    service: "vygo-api",
    process: "api",
    role: "http-api",
    commit: commit || undefined,
    // The dependency-aware Postgres/worker checks run on the Railway API's own
    // /readyz and /health; the edge surface has no database dependency.
    checks: { api: { ready: true } },
  });
}
