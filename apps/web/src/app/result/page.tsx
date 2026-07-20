import type { Metadata } from "next";
import { AnalysesConsole } from "@/components/AnalysesConsole";

export const metadata: Metadata = {
  title: "Result",
  description:
    "Default result retrieval — the latest completed analysis of a user's Default project — plus full per-project history.",
};

export default function ResultPage() {
  return <AnalysesConsole />;
}
