import type { Metadata } from "next";
import { site } from "@/content/site";
import { vibeCodingContent, vibeCodingModules } from "@/content/vibe-coding";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { VibeLoopDiagram } from "@/components/VibeLoopDiagram";
import { TopicCard } from "@/components/TopicCard";
import { GuideOffer } from "@/components/vibe-coding/GuideOffer";

export const metadata: Metadata = {
  title: site.metadata.vibeCodingTitle,
  description: site.metadata.vibeCodingDescription,
};

export default function VibeCodingPage() {
  const content = vibeCodingContent;

  return (
    <main id="main-content">
      {/* Hero */}
      <section className="section-pad" data-section="hero">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">{content.hero.eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
            {content.hero.heading}
          </h1>
          <p className="mt-6 text-lg text-muted">{content.hero.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={content.hero.primaryCta.href}>{content.hero.primaryCta.label}</CtaLink>
            {/* Rendered guide/checklist pages: plain anchors, not client-side navigation. */}
            <a className="btn-secondary" href={content.hero.guideCta.href}>
              {content.hero.guideCta.label}
            </a>
            <a className="btn-secondary" href={content.hero.checklistCta.href}>
              {content.hero.checklistCta.label}
            </a>
          </div>
        </div>
      </section>

      {/* Get the guide — free v1.2 pack download offer */}
      <GuideOffer />

      {/* What vibe coding is — and what it is not */}
      <section className="section-pad border-t border-border bg-surface" data-section="definition">
        <div className="container-page">
          <SectionHeading title={content.definition.heading} />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="card">
              <h3 className="font-display text-lg font-semibold text-green-dark">
                {content.definition.isTitle}
              </h3>
              <ul className="mt-4 space-y-2">
                {content.definition.isPoints.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-ink-soft">
                    <span
                      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green"
                      aria-hidden="true"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3 className="font-display text-lg font-semibold text-amber">
                {content.definition.isNotTitle}
              </h3>
              <ul className="mt-4 space-y-2">
                {content.definition.isNotPoints.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-ink-soft">
                    <span
                      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                      aria-hidden="true"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The loop */}
      <section className="section-pad" data-section="loop">
        <div className="container-page">
          <SectionHeading title={content.loop.heading} intro={content.loop.intro} />
          <div className="mt-10">
            <VibeLoopDiagram
              steps={content.loop.steps}
              failNote={content.loop.failNote}
              caption={content.loop.caption}
            />
          </div>
        </div>
      </section>

      {/* Non-negotiables */}
      <section
        className="section-pad border-t border-border bg-surface"
        data-section="non-negotiables"
      >
        <div className="container-page max-w-3xl">
          <SectionHeading title={content.nonNegotiables.heading} />
          <ol className="mt-8 space-y-4">
            {content.nonNegotiables.items.map((item, index) => (
              <li key={item.title} className="card">
                <h3 className="font-display text-base font-semibold">
                  <span className="mr-2 text-purple">{index + 1}.</span>
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Mental model */}
      <section className="section-pad" data-section="mental-model">
        <div className="container-page max-w-3xl">
          <SectionHeading title={content.mentalModel.heading} />
          <p className="rail mt-8 text-lg font-medium text-ink-soft">
            {content.mentalModel.sentence}
          </p>
        </div>
      </section>

      {/* Topics grid — data-driven from vibeCodingModules */}
      <section className="section-pad border-t border-border bg-surface" data-section="topics">
        <div className="container-page">
          <SectionHeading title={content.topics.heading} intro={content.topics.intro} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vibeCodingModules.map((module) => (
              <TopicCard key={module.title} topic={module} />
            ))}
          </div>
        </div>
        {/* Machine-readable module list backing the grid above. */}
        <script
          id="vibe-coding-modules"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(vibeCodingModules) }}
        />
      </section>

      {/* Final CTA */}
      <section className="section-pad bg-trust text-white" data-section="cta">
        <div className="container-page max-w-3xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            {content.finalCta.heading}
          </h2>
          <p className="mt-4 text-lg text-white/80">{content.finalCta.body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={content.hero.primaryCta.href} variant="on-dark">
              {content.hero.primaryCta.label}
            </CtaLink>
            <a className="btn-ghost-on-dark" href={content.hero.guideCta.href}>
              {content.hero.guideCta.label}
            </a>
            <a className="btn-ghost-on-dark" href={content.hero.checklistCta.href}>
              {content.hero.checklistCta.label}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
