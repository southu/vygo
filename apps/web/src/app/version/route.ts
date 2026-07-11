import { getDeployedGitSha } from "@vygo/config";
import report from "../../generated/readiness.json";

export const dynamic = "force-dynamic";

/**
 * Returns the deployed git SHA as plain text (7–40 hex chars when available).
 * Prefer Vercel/CI-injected commit metadata; fall back to build-time COMMIT_SHA.
 * Does not use version.txt.
 */
export async function GET() {
  let sha = getDeployedGitSha(process.env);

  if (!sha && process.env.COMMIT_SHA) {
    sha = process.env.COMMIT_SHA;
  }

  if (!sha && typeof report.gitSha === "string") {
    sha = report.gitSha;
  }

  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
    return new Response("unknown", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(sha, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
