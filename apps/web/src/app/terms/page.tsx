import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { termsContent } from "@/content/legal";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: site.metadata.termsTitle,
  description:
    "Terms of Use for the vygo.ai website and waitlist features operated by VYGO LLC.",
};

export default function TermsPage() {
  return <LegalDocumentView document={termsContent} />;
}
