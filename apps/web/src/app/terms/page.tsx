import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { termsContent } from "@/content/legal";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: site.metadata.termsTitle,
  description: site.metadata.termsDescription,
};

export default function TermsPage() {
  return <LegalDocumentView document={termsContent} />;
}
