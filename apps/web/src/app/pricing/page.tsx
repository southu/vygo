import type { Metadata } from "next";
import { site } from "@/content/site";
import { pricingContent } from "@/content/pricing";
import { commercialFlags } from "@/content/flags";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { EngagementCard } from "@/components/EngagementCard";
import { OpsPlanCard } from "@/components/OpsPlanCard";

export const metadata: Metadata = {
  title: site.metadata.pricingTitle,
  description: site.metadata.pricingDescription,
};

export default function PricingPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">{pricingContent.page.eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
            {pricingContent.page.heading}
          </h1>
          <p className="mt-5 text-lg text-muted">{pricingContent.page.intro}</p>
        </div>
      </section>

      {commercialFlags.showPublicPricing ? (
        <>
          <section className="section-pad border-t border-border bg-surface">
            <div className="container-page">
              <article className="overflow-hidden rounded-card bg-trust p-6 text-white shadow-card sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-green">
                  Start here
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
                  {pricingContent.audit.name}
                </h2>
                <p className="mt-3 text-xl font-semibold text-green">
                  {pricingContent.audit.price} · {pricingContent.audit.duration}
                </p>
                <p className="mt-4 max-w-3xl text-white/80">{pricingContent.audit.summary}</p>
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {pricingContent.audit.outcomes.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-white/75">
                      <span className="text-green" aria-hidden="true">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <CtaLink href={pricingContent.audit.cta.href} variant="on-dark">
                    {pricingContent.audit.cta.label}
                  </CtaLink>
                </div>
              </article>
            </div>
          </section>

          <section className="section-pad">
            <div className="container-page">
              <SectionHeading title="Build engagements" />
              <div className="mt-10 grid gap-4 lg:grid-cols-3">
                {pricingContent.tiers.map((tier) => (
                  <EngagementCard
                    key={tier.id}
                    name={tier.name}
                    price={tier.price}
                    duration={tier.duration}
                    badge={tier.badge}
                    summary={tier.summary}
                    outcomes={tier.outcomes}
                    featured={tier.id === "scale"}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="section-pad border-t border-border">
          <div className="container-page max-w-2xl">
            <p className="text-muted">
              Public pricing ranges are currently unpublished. Apply for the next opening and we
              will share engagement options that match your product stage.
            </p>
            <div className="mt-6">
              <CtaLink href={pricingContent.cta.href}>{pricingContent.cta.label}</CtaLink>
            </div>
          </div>
        </section>
      )}

      {commercialFlags.showOpsPricing ? (
        <section className="section-pad border-t border-border bg-surface">
          <div className="container-page">
            <SectionHeading title={pricingContent.ops.heading} intro={pricingContent.ops.intro} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {pricingContent.ops.plans.map((plan) => (
                <OpsPlanCard
                  key={plan.name}
                  name={plan.name}
                  price={plan.price}
                  includes={plan.includes}
                />
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm text-muted">{pricingContent.ops.note}</p>
          </div>
        </section>
      ) : null}

      <section className="section-pad border-t border-border bg-trust text-white">
        <div className="container-page flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Apply for the next opening
            </h2>
            <p className="mt-3 max-w-xl text-white/80">
              Tell us what you built and what is blocking production. We will match you to the next
              available audit or engineering pod.
            </p>
          </div>
          <CtaLink href={pricingContent.cta.href} variant="on-dark">
            {pricingContent.cta.label}
          </CtaLink>
        </div>
      </section>
    </main>
  );
}
