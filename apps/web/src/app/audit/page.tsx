import type { Metadata } from "next";
import { site } from "@/content/site";
import { auditContent } from "@/content/audit";
import { faqItems } from "@/content/faq";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { AvailabilityCard } from "@/components/AvailabilityCard";
import { FAQAccordion } from "@/components/FAQAccordion";

export const metadata: Metadata = {
  title: site.metadata.auditTitle,
  description: site.metadata.auditDescription,
};

export default function AuditPage() {
  const auditFaqs = faqItems.filter((item) =>
    [
      "What does the Production Readiness Audit include?",
      "Is the $15K audit required?",
      "Can you guarantee SOC 2 certification?",
      "Do you throw away the MVP?",
    ].includes(item.question),
  );

  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="eyebrow">Production Readiness Audit</p>
            <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
              {auditContent.hero.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted">{auditContent.hero.body}</p>
            <p className="mt-6 text-xl font-semibold text-purple">{auditContent.hero.price}</p>
            <div className="mt-8">
              <CtaLink href={auditContent.hero.cta.href}>{auditContent.hero.cta.label}</CtaLink>
            </div>
          </div>
          <AvailabilityCard />
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <SectionHeading title={auditContent.whoFor.heading} intro={auditContent.whoFor.body} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {auditContent.whoFor.items.map((item) => (
              <li key={item} className="card text-sm text-ink-soft">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHeading title={auditContent.reviews.heading} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {auditContent.reviews.categories.map((item) => (
              <li
                key={item}
                className="rounded-card border border-border bg-surface px-4 py-3 text-sm"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading title={auditContent.receives.heading} />
            <ul className="mt-8 space-y-2">
              {auditContent.receives.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-ink-soft">
                  <span className="text-green-dark" aria-hidden="true">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading title={auditContent.timeline.heading} />
            <ol className="mt-8 space-y-4">
              {auditContent.timeline.steps.map((step, index) => (
                <li key={step.title} className="card">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-purple">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHeading title={auditContent.riskCategories.heading} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {auditContent.riskCategories.items.map((item) => (
              <li key={item} className="card rail text-sm text-ink-soft">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page max-w-3xl">
          <SectionHeading title={auditContent.scope.heading} intro={auditContent.scope.body} />
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <SectionHeading title="Audit FAQ" underline={false} />
          <div className="mt-8">
            <FAQAccordion items={auditFaqs} />
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-trust text-white">
        <div className="container-page flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Ready for a fixed-price path forward?
            </h2>
            <p className="mt-3 max-w-xl text-white/80">
              Apply for the next Production Readiness Audit opening. The report is yours either way.
            </p>
          </div>
          <CtaLink href={auditContent.cta.href} variant="on-dark">
            {auditContent.cta.label}
          </CtaLink>
        </div>
      </section>
    </main>
  );
}
