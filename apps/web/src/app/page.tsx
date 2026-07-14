import { homepage } from "@/content/homepage";
import { faqItems } from "@/content/faq";
import { pricingContent } from "@/content/pricing";
import { commercialFlags } from "@/content/flags";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { HeroArchitectureDiagram } from "@/components/HeroArchitectureDiagram";
import { PainCard } from "@/components/PainCard";
import { KeepReplaceComparison } from "@/components/KeepReplaceComparison";
import { CapabilityCard } from "@/components/CapabilityCard";
import { MethodTimeline } from "@/components/MethodTimeline";
import { AuditOfferCard } from "@/components/AuditOfferCard";
import { EngagementCard } from "@/components/EngagementCard";
import { OpsPlanCard } from "@/components/OpsPlanCard";
import { FAQAccordion } from "@/components/FAQAccordion";

export default function HomePage() {
  const { hero } = homepage;

  return (
    <main id="main-content">
      {/* Hero */}
      <section className="section-pad">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem]">
              {hero.headline}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">{hero.supporting}</p>
            <p className="mt-4 text-sm font-semibold text-ink-soft">{hero.proofLine}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink href={hero.primaryCta.href}>{hero.primaryCta.label}</CtaLink>
              <CtaLink href={hero.secondaryCta.href} variant="secondary">
                {hero.secondaryCta.label}
              </CtaLink>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Lovable", "Cursor", "Replit", "Bolt", "v0"].map((tool) => (
                <span key={tool} className="chip">
                  {tool}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">{hero.toolLine}</p>
          </div>
          <HeroArchitectureDiagram
            validated={hero.validated}
            pipelineLabel={hero.pipelineLabel}
            production={hero.production}
            caption={hero.diagramCaption}
          />
        </div>
      </section>

      {/* Growing pains */}
      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <SectionHeading title={homepage.pains.heading} intro={homepage.pains.intro} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {homepage.pains.cards.map((card) => (
              <PainCard key={card.title} title={card.title} body={card.body} />
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-base font-medium text-ink-soft">
            {homepage.pains.closing}
          </p>
        </div>
      </section>

      {/* Keep vs replace */}
      <section className="section-pad">
        <div className="container-page">
          <SectionHeading title={homepage.keepReplace.heading} intro={homepage.keepReplace.intro} />
          <div className="mt-10">
            <KeepReplaceComparison
              keepTitle={homepage.keepReplace.keepTitle}
              keep={homepage.keepReplace.keep}
              replaceTitle={homepage.keepReplace.replaceTitle}
              replace={homepage.keepReplace.replace}
            />
          </div>
          <p className="mt-8 max-w-3xl text-base text-muted">{homepage.keepReplace.closing}</p>
        </div>
      </section>

      {/* Capabilities */}
      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <SectionHeading title={homepage.capabilities.heading} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {homepage.capabilities.cards.map((card) => (
              <CapabilityCard key={card.title} title={card.title} body={card.body} />
            ))}
          </div>
        </div>
      </section>

      {/* Method preview */}
      <section className="section-pad">
        <div className="container-page">
          <SectionHeading title={homepage.methodPreview.heading} />
          <div className="mt-10">
            <MethodTimeline steps={homepage.methodPreview.steps} />
          </div>
          <div className="mt-8">
            <CtaLink href={homepage.methodPreview.cta.href} variant="secondary">
              {homepage.methodPreview.cta.label}
            </CtaLink>
          </div>
        </div>
      </section>

      {/* Audit offer */}
      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <AuditOfferCard {...homepage.auditOffer} />
        </div>
      </section>

      {/* Pricing preview */}
      {commercialFlags.showPublicPricing ? (
        <section className="section-pad">
          <div className="container-page">
            <SectionHeading title={homepage.pricingPreview.heading} />
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
            {!commercialFlags.showExactEquityTerms ? (
              <p className="mt-6 max-w-3xl text-sm text-muted">{homepage.pricingPreview.note}</p>
            ) : null}
            <div className="mt-8">
              <CtaLink href={homepage.pricingPreview.cta.href} variant="secondary">
                {homepage.pricingPreview.cta.label}
              </CtaLink>
            </div>
          </div>
        </section>
      ) : null}

      {/* Security preview */}
      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <SectionHeading title={homepage.securityPreview.heading} />
          <div className="mt-8 flex flex-wrap gap-2">
            {homepage.securityPreview.groups.map((group) => (
              <span key={group} className="chip">
                {group}
              </span>
            ))}
          </div>
          <div className="mt-8">
            <CtaLink href={homepage.securityPreview.cta.href} variant="secondary">
              {homepage.securityPreview.cta.label}
            </CtaLink>
          </div>
        </div>
      </section>

      {/* Ops */}
      {commercialFlags.showOpsPricing ? (
        <section className="section-pad">
          <div className="container-page">
            <SectionHeading title={homepage.ops.heading} intro={homepage.ops.body} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {homepage.ops.plans.map((plan) => (
                <OpsPlanCard key={plan.name} name={plan.name} price={plan.price} />
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm text-muted">{homepage.ops.note}</p>
          </div>
        </section>
      ) : null}

      {/* Why vygo */}
      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <SectionHeading title={homepage.why.heading} />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {homepage.why.points.map((point, index) => (
              <li key={point.title} className="card">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-purple">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold">{point.title}</h3>
                <p className="mt-2 text-sm text-muted">{point.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <CtaLink href={homepage.why.cta.href} variant="secondary">
              {homepage.why.cta.label}
            </CtaLink>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <SectionHeading title="Frequently asked questions" underline={false} />
          <div className="mt-8">
            <FAQAccordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-pad border-t border-border bg-trust text-white">
        <div className="container-page max-w-3xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            {homepage.finalCta.heading}
          </h2>
          <p className="mt-4 text-lg text-white/80">{homepage.finalCta.body}</p>
          <div className="mt-8">
            <CtaLink href={homepage.finalCta.cta.href} variant="on-dark">
              {homepage.finalCta.cta.label}
            </CtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}
