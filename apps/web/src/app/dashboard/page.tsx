import type { Metadata } from "next";
import { AnalysesConsole } from "@/components/AnalysesConsole";
import { StalenessBadge } from "@/components/StalenessBadge";
import { readStalenessStatus } from "@/lib/staleness-source";

export const metadata: Metadata = {
  title: "Analyses dashboard",
  description:
    "Browser-verifiable dashboard for the analysis-history model: Default project migration, multi-project history, and latest-completed result retrieval.",
};

export default function DashboardPage() {
  const staleness = readStalenessStatus();
  return (
    <>
      <div className="container-page flex items-center gap-3 pt-6" data-section="staleness">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">
          Guide staleness
        </span>
        <StalenessBadge status={staleness} />
      </div>
      <AnalysesConsole />
    </>
  );
}
