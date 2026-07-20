import type { Metadata } from "next";
import { site } from "@/content/site";
import { pricingContent } from "@/content/pricing";
import { commercialFlags } from "@/content/flags";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { EngagementCard } from "@/components/EngagementCard";
import { OpsPlanCard } from "@/components/OpsPlanCard";
import { PricingHighlight } from "@/components/PricingHighlight";

export const metadata: Metadata = {
  title: site.metadata.pricingTitle,
  description: site.metadata.pricingDescription,
};

export default function PricingPage() {
  const { harden } = pricingContent;

  return (
    <main id="main-content">
      <PricingHighlight />
      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">{pricingContent.page.eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
            {pricingContent.page.heading}
          </h1>
          <p className="mt-5 text-lg text-muted">{pricingContent.page.intro}</p>
        </div>
      </section>

      {/* vygo Harden — standalone focused engagement (not a full build tier) */}
      <section
        id={harden.id}
        className="section-pad border-t border-border bg-surface"
        data-section="harden"
        aria-labelledby="harden-heading"
      >
        <div className="container-page">
          <div className="max-w-3xl">
            <p className="eyebrow">{harden.eyebrow}</p>
            <h2 id="harden-heading" className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              {harden.headline}
            </h2>
            <div className="mt-5 space-y-4 text-lg text-muted">
              {harden.introduction.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-ink-soft">{harden.qualificationNote}</p>
          </div>

          <div
            data-highlight-target="harden"
            className="mt-8 flex scroll-mt-28 flex-col gap-6 rounded-card border border-border bg-canvas p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
          >
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-purple">
                {harden.name}
              </p>
              <p className="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">
                {harden.priceLabel}
              </p>
              <p className="mt-1 text-base font-semibold text-green-dark">{harden.duration}</p>
              <p className="mt-3 max-w-xl text-sm text-muted">{harden.ctaSupport}</p>
            </div>
            <div className="shrink-0">
              <CtaLink href={harden.cta.href}>{harden.cta.label}</CtaLink>
            </div>
          </div>

          <div className="mt-12">
            <h3 className="font-display text-xl font-bold text-ink">Example use cases</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted">{harden.examplesIntro}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {harden.examples.map((example) => (
                <article
                  key={example.title}
                  className="card flex h-full flex-col border-purple/15 bg-surface"
                  data-harden-example
                >
                  <h4 className="font-display text-lg font-bold text-ink">{example.title}</h4>
                  <p className="mt-2 text-sm font-medium text-purple-dark">{example.summary}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{example.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <h3 className="font-display text-xl font-bold text-ink">
              What vygo Harden may include
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-muted">{harden.mayIncludeIntro}</p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {harden.mayInclude.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-ink-soft">
                  <span className="text-green-dark" aria-hidden="true">
                    ·
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-3xl text-sm text-muted">{harden.mayIncludeNote}</p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-green/30 bg-surface p-6">
              <h3 className="font-display text-lg font-bold text-green-dark">
                {harden.goodFit.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {harden.goodFit.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-ink-soft">
                    <span className="text-green-dark" aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-border bg-surface p-6">
              <h3 className="font-display text-lg font-bold text-ink">
                {harden.fullerEngagement.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {harden.fullerEngagement.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-ink-soft">
                    <span className="text-muted" aria-hidden="true">
                      →
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 max-w-3xl">
            <p className="text-base text-ink-soft">{harden.closing}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <CtaLink href={harden.cta.href}>{harden.cta.label}</CtaLink>
              <CtaLink href={harden.secondaryCta.href} variant="secondary">
                {harden.secondaryCta.label}
              </CtaLink>
            </div>
          </div>
        </div>
      </section>

      {commercialFlags.showPublicPricing ? (
        <>
          <section
            id={pricingContent.audit.id}
            className="section-pad border-t border-border"
            data-section="audit"
          >
            <div className="container-page">
              <article
                data-highlight-target="production-readiness-audit"
                className="overflow-hidden rounded-card bg-trust p-6 text-white shadow-card sm:p-8"
              >
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

          <section className="section-pad border-t border-border bg-surface">
            <div className="container-page">
              <SectionHeading title="Build engagements" />
              <div className="mt-10 grid gap-4 lg:grid-cols-3" data-section="build-tiers">
                {pricingContent.tiers.map((tier) => (
                  <EngagementCard
                    key={tier.id}
                    id={tier.id}
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
