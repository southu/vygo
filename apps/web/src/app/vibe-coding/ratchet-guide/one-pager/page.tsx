import type { Metadata } from "next";
import { GuideDocPage } from "@/components/vibe-coding/GuideDocPage";
import { getGuideDoc } from "@/content/ratchet-guide";
import { readGuideDocMarkdown, readGuidePackManifest } from "@/lib/guide-source";
import { extractLeadingH1 } from "@/lib/markdown";

const doc = getGuideDoc("one-pager");
const markdown = readGuideDocMarkdown(doc.sourceFile);
const version = readGuidePackManifest().version;
const title = extractLeadingH1(markdown) ?? doc.title;

export const metadata: Metadata = {
  title: `${title} — Ratchet system guide`,
  description: doc.blurb,
};

export default function GuideOnePagerPage() {
  return <GuideDocPage doc={doc} title={title} markdown={markdown} version={version} />;
}
