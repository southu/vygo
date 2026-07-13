import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { privacyContent } from "@/content/legal";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: site.metadata.privacyTitle,
  description: site.metadata.privacyDescription,
};

export default function PrivacyPage() {
  return <LegalDocumentView document={privacyContent} />;
}
