import type { Metadata } from "next";
import { OpsReadinessClient } from "./OpsReadinessClient";

export const metadata: Metadata = {
  title: "Ops · Readiness list",
  robots: { index: false, follow: false },
  description: "Internal readiness submissions list (ops only).",
};

/**
 * Internal ops readiness list (read-only v1).
 *
 * Path: /ops/readiness
 * Auth: HTTP Basic via OPS_BASIC_AUTH_USER / OPS_BASIC_AUTH_PASSWORD (env).
 * Data API: same-origin /v1/ops/readiness* (never api.vygo.ai).
 */
export default function OpsReadinessPage() {
  return (
    <main id="main-content" className="container-page section-pad">
      <OpsReadinessClient />
    </main>
  );
}
