import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { privacyContent } from "@/content/legal";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: site.metadata.privacyTitle,
  description:
    "Privacy Policy for VYGO LLC explaining how vygo.ai collects, uses, and protects personal information from the marketing site and waitlist.",
};

export default function PrivacyPage() {
  return <LegalDocumentView document={privacyContent} />;
}
