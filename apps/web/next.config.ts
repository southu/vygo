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
};

export default nextConfig;
