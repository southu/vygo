import type { Metadata } from "next";
import { AnalysesConsole } from "@/components/AnalysesConsole";

export const metadata: Metadata = {
  title: "Analyses",
  description:
    "Live analysis-history view: per-project history with status and created_at, and default latest-completed result retrieval.",
};

export default function AnalysesPage() {
  return <AnalysesConsole />;
}
