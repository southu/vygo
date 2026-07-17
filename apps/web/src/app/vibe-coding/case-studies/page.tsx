import type { Metadata } from "next";
import { ModulePage } from "@/components/vibe-coding/ModulePage";
import { getVibeModulePage } from "@/content/vibe-coding-modules";

const module = getVibeModulePage("case-studies");

export const metadata: Metadata = {
  title: `${module.title} — Vibe coding`,
  description: module.description,
};

export default function CaseStudiesPage() {
  return <ModulePage module={module} />;
}
