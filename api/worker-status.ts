/**
 * GET /api/worker-status (also served at /worker, /worker/status, /workerz via
 * vercel.json) — the email worker service's status surface exposed on the
 * marketing edge (www.vygo.ai).
 *
 * It identifies the worker process (distinct from the API — separate backend
 * services) and reports the deployed git SHA. The long-lived worker in
 * `apps/worker` serves the equivalent surface on Railway (see
 * `apps/worker/src/health-server.ts`); this edge mirror lets a black-box
 * verifier confirm the separate worker process is running and identified.
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
    running: true,
    ready: true,
    status: "running",
    service: "vygo-worker",
    process: "worker",
    role: "email-outbox-worker",
    commit: commit || undefined,
  };

  res.status(200).json(body);
}
