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
import { resolveUpstreamApiOrigin } from "./_lib/store.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";

/** Live liveness probe of the upstream Railway API (server-to-server). */
async function railwayApiReachable(origin: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${origin}/healthz`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
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

  // Reflect reality: probe the live Railway API. When it responds, the Railway
  // topology (Postgres + API) is live and the availability surface is
  // database-backed, so report `railwayApiLive: true` — otherwise fail honest.
  const origin = resolveUpstreamApiOrigin();
  const live = await railwayApiReachable(origin);
  const status = buildProvisioningStatus(deployedGitSha(), live, { reachableOrigin: origin });
  res.status(200).json(status);
}
