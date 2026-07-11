import type { NextConfig } from "next";

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.GIT_COMMIT_SHA ||
  "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vygo/config", "@vygo/ui", "@vygo/validation"],
  env: {
    COMMIT_SHA: commitSha,
  },
};

export default nextConfig;
