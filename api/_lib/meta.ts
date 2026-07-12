/**
 * Shared metadata + CORS helpers for the backend health surfaces exposed on the
 * marketing edge (www.vygo.ai). These functions mirror the Fastify API/worker
 * health responses so a black-box verifier can confirm the backend services are
 * healthy and correctly identified without reaching the private Railway URLs.
 *
 * Responses are always secret-safe: only booleans and identity strings — never
 * DATABASE_URL, REDIS_URL, Resend/Turnstile secrets, or connection strings.
 */
import {
  evaluateOrigin,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "./http.js";

/**
 * Deployed git SHA, resolved from the documented build-metadata env vars — the
 * same precedence the API's `getDeployedGitSha` and `GET /version` use, so the
 * health SHA matches `/version` (and the deploy gate's `version.txt`).
 */
export function deployedGitSha(env: NodeJS.ProcessEnv = process.env): string {
  const sha =
    env.VERCEL_GIT_COMMIT_SHA || env.COMMIT_SHA || env.GIT_COMMIT_SHA || env.GITHUB_SHA || "";
  return sha.trim();
}

/**
 * Apply strict origin-allowlist CORS. Only a configured allowed origin receives
 * an `Access-Control-Allow-Origin`; unconfigured origins get none. Returns true
 * when the request was a handled OPTIONS preflight (caller should stop).
 */
export function applyCorsAndMaybePreflight(req: EdgeRequest, res: EdgeResponse): boolean {
  const allowedOrigins = resolveAllowedOrigins();
  const { allowed, origin } = evaluateOrigin(req.headers, allowedOrigins);

  res.setHeader("Vary", "Origin");
  if (origin && allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Standard no-store JSON headers for a health surface. */
export function applyHealthHeaders(res: EdgeResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}
