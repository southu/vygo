import type { Metadata } from "next";
import { ModulePage } from "@/components/vibe-coding/ModulePage";
import { getVibeModulePage } from "@/content/vibe-coding-modules";

const module = getVibeModulePage("live-verify-testing");

export const metadata: Metadata = {
  title: `${module.title} — Vibe coding`,
  description: module.description,
};

export default function LiveVerifyTestingPage() {
  return <ModulePage module={module} />;
}
