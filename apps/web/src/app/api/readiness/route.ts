import { getDeployedGitSha } from "@vygo/config";
import report from "../../../generated/readiness.json";

export const dynamic = "force-dynamic";

export async function GET() {
  const sha = getDeployedGitSha(process.env) || process.env.COMMIT_SHA || "";

  const body = {
    ...report,
    ready: report.ready === true,
    deployedGitSha: sha || report.gitSha || null,
    checkedAt: new Date().toISOString(),
  };

  return Response.json(body, {
    status: body.ready ? 200 : 503,
    headers: {
      "cache-control": "no-store",
    },
  });
}
