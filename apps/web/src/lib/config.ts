/**
 * Public, browser-safe runtime configuration surfaced in the deployed page
 * source (see `layout.tsx`). Values here are non-secret NEXT_PUBLIC_* config.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is the HTTPS origin the Vercel frontend uses to
 * reach the vygo API. The API SERVICE is defined on Railway (project `vygo`);
 * until those Railway services are provisioned and reachable, the API's health
 * and version surfaces are mirrored on the Vercel edge (www.vygo.ai), so the
 * advertised base URL points at that reachable edge-mirror origin — never at an
 * origin that fails to resolve. The documented Railway cut-over target is
 * `RAILWAY_API_TARGET_ORIGIN` (api.vygo.ai); once the Railway API is live an
 * operator sets NEXT_PUBLIC_API_BASE_URL to its public HTTPS origin and this
 * value follows automatically. Live topology detail: GET /provisioning-status.
 *
 * Actual browser→API traffic resolves same-origin via `apps/web/src/lib/api.ts`
 * (NEXT_PUBLIC_API_URL); this base URL is the documented, verifiable identifier.
 */

/** Documented Railway API cut-over target — public identifier, never a secret. */
export const RAILWAY_API_TARGET_ORIGIN = "https://api.vygo.ai";

/**
 * Reachable API origin today: the Vercel edge mirror of the API's /health and
 * /version surfaces (served from www.vygo.ai). Used until the Railway API
 * service is provisioned and the cut-over origin resolves.
 */
export const EDGE_API_MIRROR_ORIGIN = "https://www.vygo.ai";

/** Documented vygo Vercel preview-origin CORS policy (mirrors @vygo/config). */
export const VERCEL_PREVIEW_ORIGIN_PATTERN = "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$";

/**
 * Resolve the advertised public API base URL. A valid NEXT_PUBLIC_API_BASE_URL
 * override wins EXCEPT the not-yet-live Railway cut-over target placeholder
 * (`RAILWAY_API_TARGET_ORIGIN`), which is rewritten to the reachable edge mirror
 * so the deployed page never advertises an origin that does not resolve. With no
 * override, defaults to the edge mirror. Trailing slash stripped for a clean origin.
 */
export function resolvePublicApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    const origin = fromEnv.replace(/\/$/, "");
    if (origin === RAILWAY_API_TARGET_ORIGIN) return EDGE_API_MIRROR_ORIGIN;
    return origin;
  }
  return EDGE_API_MIRROR_ORIGIN;
}

const resolvedApiBaseUrl = resolvePublicApiBaseUrl();
const railwayApiLive = resolvedApiBaseUrl !== EDGE_API_MIRROR_ORIGIN;

/**
 * Non-secret config object embedded verbatim in the deployed HTML. The literal
 * `NEXT_PUBLIC_API_BASE_URL` key lets a black-box verifier read the advertised,
 * reachable API origin directly from the page source.
 */
export const publicConfig = {
  frontendPlatform: "vercel",
  marketingPlatform: "vercel",
  apiPlatform: "railway",
  // Current serving mode of the reachable API origin. The Railway API service is
  // defined but not yet provisioned this run, so its health/version are mirrored
  // on the Vercel edge until cut-over. Live detail: /provisioning-status.
  apiOriginMode: railwayApiLive ? "railway" : "vercel-edge-mirror",
  railwayApiLive,
  railwayApiTargetOrigin: RAILWAY_API_TARGET_ORIGIN,
  apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
  apiBaseUrl: resolvedApiBaseUrl,
  NEXT_PUBLIC_API_BASE_URL: resolvedApiBaseUrl,
  corsPreviewOriginPattern: VERCEL_PREVIEW_ORIGIN_PATTERN,
  provisioningStatusEndpoint: "/provisioning-status",
} as const;
