import type { Metadata } from "next";
import { GuideProgressPanel } from "@/components/GuideProgressPanel";
import { StalenessBadge } from "@/components/StalenessBadge";
import { readGuideLearningsSnapshot } from "@/lib/guide-learnings-source";
import { readStalenessStatus } from "@/lib/staleness-source";

export const metadata: Metadata = {
  title: "Guide progress",
  description:
    "Live progress of the Ratchet system guide: learnings incorporated vs pending, each with its source and affected sections, the guide's last-updated date, and a staleness signal.",
};

/**
 * Ratchet guide-progress page at /guide-progress. The panel is server-rendered
 * from a build-time snapshot of the canonical learnings log (so counts, rows,
 * and the last-updated date are in page source) and re-fetches the live
 * /api/guide/learnings endpoint on load. The staleness badge is server-rendered
 * from the same source as GET /api/staleness, so its data-stale attribute always
 * matches the endpoint.
 */
export default function GuideProgressPage() {
  const snapshot = readGuideLearningsSnapshot();
  const staleness = readStalenessStatus();
  return (
    <main id="main-content" data-page="guide-progress">
      <div className="container-page max-w-4xl pt-8">
        <div className="flex items-center gap-3" data-section="staleness">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">
            Guide staleness
          </span>
          <StalenessBadge status={staleness} />
        </div>
      </div>
      <GuideProgressPanel initial={snapshot} />
    </main>
  );
}
