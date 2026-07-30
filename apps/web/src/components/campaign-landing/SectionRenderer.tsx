import type { CampaignSection } from "@/lib/campaign/types";
import { HeroSection } from "./HeroSection";
import { BenefitsSection } from "./BenefitsSection";
import { MethodSection } from "./MethodSection";
import { AssuranceSection } from "./AssuranceSection";
import { FaqSection } from "./FaqSection";
import { LeadFormSection } from "./LeadFormSection";
import { ClosingCtaSection } from "./ClosingCtaSection";

/** Maps a configured section to its shared component. */
export function SectionRenderer({ section }: { section: CampaignSection }) {
  switch (section.type) {
    case "hero":
      return <HeroSection id={section.id} data={section.data} />;
    case "benefits":
      return <BenefitsSection id={section.id} data={section.data} />;
    case "method":
      return <MethodSection id={section.id} data={section.data} />;
    case "assurance":
      return <AssuranceSection id={section.id} data={section.data} />;
    case "faq":
      return <FaqSection id={section.id} data={section.data} />;
    case "lead":
      return <LeadFormSection id={section.id} data={section.data} />;
    case "closingCta":
      return <ClosingCtaSection id={section.id} data={section.data} />;
    default:
      return null;
  }
}
