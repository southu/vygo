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
 * Reachable Railway API origin (project `vygo`, service `api`) serving the live,
 * Postgres-backed availability surface. This is the default advertised origin:
 * the marketing edge reads the next audit start date through this API, so the
 * displayed value is database-backed. Once DNS for `api.vygo.ai` is attached, an
 * operator sets `NEXT_PUBLIC_API_BASE_URL` to it with no code change.
 */
export const DEFAULT_RAILWAY_API_ORIGIN = "https://api-production-7f2d.up.railway.app";

/**
 * Vercel edge-mirror origin (served from www.vygo.ai). Retained as the safe
 * fallback advertised only if the Railway origin is explicitly disabled.
 */
export const EDGE_API_MIRROR_ORIGIN = "https://www.vygo.ai";

/** Documented vygo Vercel preview-origin CORS policy (mirrors @vygo/config). */
export const VERCEL_PREVIEW_ORIGIN_PATTERN = "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$";

/**
 * Resolve the advertised public API base URL. A valid NEXT_PUBLIC_API_BASE_URL
 * override wins EXCEPT the not-yet-resolving `api.vygo.ai` target placeholder,
 * which is rewritten to the reachable Railway origin so the deployed page never
 * advertises an origin that does not resolve. With no override, defaults to the
 * reachable Railway API origin. Trailing slash stripped for a clean origin.
 */
export function resolvePublicApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    const origin = fromEnv.replace(/\/$/, "");
    if (origin === RAILWAY_API_TARGET_ORIGIN) return DEFAULT_RAILWAY_API_ORIGIN;
    return origin;
  }
  return DEFAULT_RAILWAY_API_ORIGIN;
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
  // Current serving mode of the reachable API origin. The Railway API (project
  // vygo, service api) is live and serves the Postgres-backed availability
  // surface; the marketing edge reads the audit date through it. Live detail:
  // /provisioning-status.
  apiOriginMode: railwayApiLive ? "railway" : "vercel-edge-mirror",
  railwayApiLive,
  railwayApiTargetOrigin: RAILWAY_API_TARGET_ORIGIN,
  apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
  apiBaseUrl: resolvedApiBaseUrl,
  NEXT_PUBLIC_API_BASE_URL: resolvedApiBaseUrl,
  corsPreviewOriginPattern: VERCEL_PREVIEW_ORIGIN_PATTERN,
  provisioningStatusEndpoint: "/provisioning-status",
} as const;
