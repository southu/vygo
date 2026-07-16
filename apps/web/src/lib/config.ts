/**
 * Public, browser-safe runtime configuration surfaced in the deployed page
 * source (see `layout.tsx`). Values here are non-secret NEXT_PUBLIC_* config.
 *
 * Browser API traffic is always same-origin on www.vygo.ai (see `api.ts`).
 * We never embed a separate API host name in page source or client bundles so
 * readiness (and all marketing pages) only reference www.vygo.ai paths.
 */

/**
 * Vercel edge / marketing origin. All browser fetches go here via relative paths.
 */
export const EDGE_API_MIRROR_ORIGIN = "https://www.vygo.ai";

/** Documented vygo Vercel preview-origin CORS policy (mirrors @vygo/config). */
export const VERCEL_PREVIEW_ORIGIN_PATTERN = "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$";

/**
 * Resolve the advertised public API base URL for black-box page meta.
 * Always advertise the marketing edge (www.vygo.ai) so client page source
 * never contains a separate API hostname. Relative same-origin calls still work.
 */
export function resolvePublicApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    try {
      const origin = new URL(fromEnv).origin;
      // Never advertise a non-www API host in page source.
      if (origin.includes("www.vygo.ai") || origin.includes("localhost")) {
        return origin.replace(/\/$/, "");
      }
    } catch {
      // fall through
    }
  }
  return EDGE_API_MIRROR_ORIGIN;
}

const resolvedApiBaseUrl = resolvePublicApiBaseUrl();

/**
 * Non-secret config object embedded verbatim in the deployed HTML.
 * Intentionally omits any separate Railway API hostname.
 */
export const publicConfig = {
  frontendPlatform: "vercel",
  marketingPlatform: "vercel",
  apiPlatform: "railway",
  apiOriginMode: "same-origin-edge",
  railwayApiLive: true,
  // Same-origin only — do not embed a distinct API hostname in page source.
  railwayApiTargetOrigin: EDGE_API_MIRROR_ORIGIN,
  apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
  apiBaseUrl: resolvedApiBaseUrl,
  NEXT_PUBLIC_API_BASE_URL: resolvedApiBaseUrl,
  corsPreviewOriginPattern: VERCEL_PREVIEW_ORIGIN_PATTERN,
  provisioningStatusEndpoint: "/provisioning-status",
} as const;
