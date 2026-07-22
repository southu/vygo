import type { Metadata } from "next";
import { GuideProgressPanel } from "@/components/GuideProgressPanel";
import { readGuideLearningsSnapshot } from "@/lib/guide-learnings-source";

export const metadata: Metadata = {
  title: "Guide progress",
  description:
    "Live progress of the Ratchet system guide: learnings incorporated vs pending, each with its source and affected sections, and the guide's last-updated date.",
};

/**
 * Ratchet guide-progress page at /guide-progress. The panel is server-rendered
 * from a build-time snapshot of the canonical learnings log (so counts, rows,
 * and the last-updated date are in page source) and re-fetches the live
 * /api/guide/learnings endpoint on load.
 */
export default function GuideProgressPage() {
  const snapshot = readGuideLearningsSnapshot();
  return (
    <main id="main-content" data-page="guide-progress">
      <GuideProgressPanel initial={snapshot} />
    </main>
  );
}
