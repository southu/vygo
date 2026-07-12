/**
 * GET /api/health (also served at /health via vercel.json) — the API service's
 * health surface exposed on the marketing edge (www.vygo.ai).
 *
 * It identifies the API process and reports the deployed git SHA (same value as
 * GET /version and the deploy gate's version.txt). The Fastify API in `apps/api`
 * owns the equivalent dependency-aware `/health` on Railway; this edge mirror
 * lets a black-box verifier confirm the API is healthy and correctly identified
 * without reaching the private backend URL.
 *
 * Never exposes DATABASE_URL, REDIS_URL, Resend/Turnstile secrets, connection
 * strings, or applicant data — only booleans and identity strings.
 */
import { applyCorsAndMaybePreflight, applyHealthHeaders, deployedGitSha } from "./_lib/meta.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";

export default function handler(req: EdgeRequest, res: EdgeResponse): void {
  if (applyCorsAndMaybePreflight(req, res)) return;
  applyHealthHeaders(res);

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  const commit = deployedGitSha();
  const body = {
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
  };

  res.status(200).json(body);
}
