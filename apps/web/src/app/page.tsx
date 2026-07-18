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
import { HardenCallout } from "@/components/HardenCallout";
import { OpsPlanCard } from "@/components/OpsPlanCard";
import { FAQAccordion } from "@/components/FAQAccordion";
import { StepList } from "@/components/vibe-coding/StepCard";
import { StartFreeLeadForm } from "@/components/StartFreeLeadForm";
import { setupSteps } from "@/content/guide-setup";
import { getGuideDoc, guideIndex, guideIndexMarkdownHref } from "@/content/ratchet-guide";

export default function HomePage() {
  const { hero } = homepage;
  const rebuildDoc = getGuideDoc("rebuild");

  return (
    <main id="main-content">
      {/* Hero */}
      <section className="section-pad" data-section="hero">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-full text-balance break-words font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem]">
              {hero.headline}
            </h1>
            <div className="mt-5 max-w-xl space-y-4 text-lg text-muted">
              {hero.bodyParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
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

      {/* Get set up first — the very first action, before any other content */}
      <section className="section-pad border-t border-border bg-surface" data-section="setup-first">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">Step 1</p>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            Get set up for vibe coding first
          </h2>
          <p className="mt-4 text-lg text-muted">
            Have you started vibe coding yet? What are you waiting for? Get started now with our
            kick-start Ratchet system and leapfrog everyone still using CLIs and applications that
            miss out on real-world learning from real-world power users.
          </p>
          <StepList steps={setupSteps} />
          <div className="mt-8">
            <StartFreeLeadForm />
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2" data-section="document-journey">
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Formatted page
              </p>
              <a
                href={guideIndex.href}
                className="mt-2 block font-display text-base font-semibold text-purple hover:underline"
                data-doc-link="guide-formatted"
              >
                Read the Ratchet system guide
              </a>
              <a
                href={guideIndexMarkdownHref}
                download="README.md"
                className="mt-3 inline-block text-sm font-semibold text-purple underline"
                data-doc-link="guide-raw"
                data-download-link="guide-index-markdown"
              >
                Download raw Markdown (.md)
              </a>
            </div>
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Formatted page
              </p>
              <a
                href={rebuildDoc.href}
                className="mt-2 block font-display text-base font-semibold text-purple hover:underline"
                data-doc-link="rebuild-formatted"
              >
                Read the rebuild checklist
              </a>
              <a
                href={`/content/vibe-coding/ratchet-guide/${rebuildDoc.sourceFile}`}
                download={rebuildDoc.sourceFile}
                className="mt-3 inline-block text-sm font-semibold text-purple underline"
                data-doc-link="rebuild-raw"
                data-download-link="doc-markdown"
              >
                Download raw Markdown (.md)
              </a>
            </div>
          </div>
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

      {/* Free guide — public /guide landing with download + optional notify */}
      <section className="section-pad border-t border-border bg-surface" data-section="guide-offer">
        <div className="container-page max-w-3xl">
          <SectionHeading
            eyebrow={homepage.guideOffer.eyebrow}
            title={homepage.guideOffer.heading}
            intro={homepage.guideOffer.body}
          />
          <div className="mt-8">
            <CtaLink href={homepage.guideOffer.cta.href} variant="secondary">
              {homepage.guideOffer.cta.label}
            </CtaLink>
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
        <section className="section-pad" data-section="pricing-preview">
          <div className="container-page">
            <SectionHeading title={homepage.pricingPreview.heading} />
            <div className="mt-10 grid gap-4 lg:grid-cols-3" data-section="engagement-tiers">
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
            <HardenCallout
              {...homepage.pricingPreview.hardenCallout}
              bestFor={pricingContent.harden.bestFor}
            />
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
