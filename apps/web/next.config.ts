import type { NextConfig } from "next";

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.GIT_COMMIT_SHA ||
  "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export so Vercel can deploy the monorepo without Root Directory=apps/web.
  // Machine endpoints are written to public/ at prebuild by scripts/generate-readiness.ts.
  output: "export",
  transpilePackages: ["@vygo/config", "@vygo/ui", "@vygo/validation"],
  env: {
    COMMIT_SHA: commitSha,
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
