import type { NextConfig } from "next";

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.GIT_COMMIT_SHA ||
  "";

/**
 * Public Turnstile site key (safe to embed). Prefer the host env; when unset,
 * use Cloudflare's official always-pass test sitekey so the widget matches
 * Railway's TURNSTILE_SECRET_KEY when that secret is the always-pass pair.
 * Never embed TURNSTILE_SECRET_KEY (server-only).
 */
const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "1x0000000000000000000000000000000AA";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export so Vercel can deploy the monorepo without Root Directory=apps/web.
  // Machine endpoints are written to public/ at prebuild by scripts/generate-readiness.ts.
  output: "export",
  transpilePackages: ["@vygo/config", "@vygo/ui", "@vygo/validation"],
  env: {
    COMMIT_SHA: commitSha,
    // Always inline so client bundles never ship with an empty sitekey slot.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: turnstileSiteKey,
  },
  // Workspace packages use NodeNext `.js` import specifiers that point at `.ts`
  // sources. Map them so webpack can resolve during transpilePackages.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
