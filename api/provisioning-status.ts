/**
 * GET /provisioning-status (also served at /provisioning and
 * /api/provisioning-status via vercel.json) — the live, secret-free Railway
 * provisioning-status surface exposed on the marketing edge (www.vygo.ai).
 *
 * It lets a black-box verifier confirm the intended Railway topology (Postgres,
 * Redis, API, worker), the reference-only wiring of DATABASE_URL / REDIS_URL,
 * the project-shell-only limitation (with exact executable remaining actions),
 * and that the frontend + marketing site stay Vercel-bound — all WITHOUT
 * exposing any credential.
 *
 * Never exposes DATABASE_URL, REDIS_URL, Vault/Resend/Turnstile secrets, tokens,
 * passwords, or connection strings — only env names, reference expressions,
 * public URLs, booleans, and enums. See `api/_lib/provisioning.ts`.
 */
import { applyCorsAndMaybePreflight, applyHealthHeaders, deployedGitSha } from "./_lib/meta.js";
import { buildProvisioningStatus } from "./_lib/provisioning.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";

export default function handler(req: EdgeRequest, res: EdgeResponse): void {
  if (applyCorsAndMaybePreflight(req, res)) return;
  applyHealthHeaders(res);

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  // Services are created only by a real (armed) provisioning run; this builder
  // holds no Railway token and fails closed, so `servicesCreated` stays false.
  const status = buildProvisioningStatus(deployedGitSha());
  res.status(200).json(status);
}
