import type { Metadata } from "next";
import { OpsJobsClient } from "./OpsJobsClient";

export const metadata: Metadata = {
  title: "Ops · Job roles",
  robots: { index: false, follow: false },
  description: "Internal job-role management (ops only).",
};

/**
 * Internal admin surface for job roles.
 *
 * Path: /ops/jobs
 * Auth: HTTP Basic via OPS_BASIC_AUTH_USER / OPS_BASIC_AUTH_PASSWORD (env),
 *   the same credential that guards /ops/readiness. No management controls are
 *   rendered until credentials are entered (client-side login gate).
 * Data API: same-origin /api/internal/roles* — the job-board data layer. This
 *   surface never invents a parallel data path; every read/write goes through
 *   those internal endpoints, so changes take effect on GET /api/roles live.
 */
export default function OpsJobsPage() {
  return (
    <main id="main-content" className="container-page section-pad">
      <OpsJobsClient />
    </main>
  );
}
