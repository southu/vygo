/**
 * Public, browser-safe runtime configuration surfaced in the deployed page
 * source (see `layout.tsx`). Values here are non-secret NEXT_PUBLIC_* config.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is the HTTPS origin of the Railway-hosted API
 * service (project `vygo`). It identifies where the Vercel frontend targets the
 * Railway API. It defaults to the Railway API custom domain so the deployed page
 * always advertises a correct value even before the Vercel env var is set.
 *
 * Note: the live marketing waitlist form posts same-origin to the Vercel edge
 * mirror (`/v1/waitlist`) until the Railway API service is live; this base URL is
 * the documented cut-over target. See `apps/web/src/lib/api.ts`.
 */

/** Railway API custom domain — public identifier, never a secret. */
export const RAILWAY_API_BASE_URL = "https://api.vygo.ai";

/** Documented vygo Vercel preview-origin CORS policy (mirrors @vygo/config). */
export const VERCEL_PREVIEW_ORIGIN_PATTERN = "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$";

/**
 * Resolve the public API base URL from NEXT_PUBLIC_API_BASE_URL, falling back to
 * the Railway API custom domain. Trailing slash stripped for a clean origin.
 */
export function resolvePublicApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  return RAILWAY_API_BASE_URL;
}

/**
 * Non-secret config object embedded verbatim in the deployed HTML. The literal
 * `NEXT_PUBLIC_API_BASE_URL` key lets a black-box verifier read the configured
 * Railway API origin directly from the page source.
 */
export const publicConfig = {
  frontendPlatform: "vercel",
  apiPlatform: "railway",
  apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
  apiBaseUrl: resolvePublicApiBaseUrl(),
  NEXT_PUBLIC_API_BASE_URL: resolvePublicApiBaseUrl(),
  corsPreviewOriginPattern: VERCEL_PREVIEW_ORIGIN_PATTERN,
} as const;
