import type { Metadata } from "next";
import { AnalysesConsole } from "@/components/AnalysesConsole";

export const metadata: Metadata = {
  title: "Analyses dashboard",
  description:
    "Browser-verifiable dashboard for the analysis-history model: Default project migration, multi-project history, and latest-completed result retrieval.",
};

export default function DashboardPage() {
  return <AnalysesConsole />;
}
