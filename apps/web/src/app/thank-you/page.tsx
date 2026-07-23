import type { Metadata } from "next";
import { site } from "@/content/site";
import { thankYouContent } from "@/content/waitlist";
import { CtaLink } from "@/components/CtaLink";
import { TextWithEmail } from "@/components/TextWithEmail";

export const metadata: Metadata = {
  title: site.metadata.thankYouTitle,
  description: site.metadata.thankYouDescription,
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Application received</p>
          <h1 className="mt-4 font-display text-4xl font-bold">{thankYouContent.heading}</h1>
          <p className="mt-5 text-lg text-muted">
            <TextWithEmail text={thankYouContent.body} />
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={thankYouContent.cta.href}>{thankYouContent.cta.label}</CtaLink>
            <CtaLink href={thankYouContent.homeCta.href} variant="secondary">
              {thankYouContent.homeCta.label}
            </CtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}
