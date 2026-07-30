import { CampaignCtaLink } from "./CampaignCtaLink";
import type { HeroSectionData } from "@/lib/campaign/types";

/**
 * Above-the-fold hero. Carries the page's single h1 and the primary persuasion
 * entry points. Content image lives below the fold in the method section.
 */
export function HeroSection({ id, data }: { id: string; data: HeroSectionData }) {
  return (
    <section id={id} data-campaign-section="hero" data-section-id={id} className="section-pad">
      <div className="container-page grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-2xl">
          {data.eyebrow ? <p className="eyebrow mb-3">{data.eyebrow}</p> : null}
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
            {data.heading}
          </h1>
          <p className="mt-5 text-lg text-muted">{data.subheading}</p>
          {data.bullets && data.bullets.length > 0 ? (
            <ul className="mt-6 space-y-2">
              {data.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-ink-soft">
                  <span aria-hidden="true" className="mt-1 text-green-dark">
                    ✓
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <CampaignCtaLink
              href={data.primaryCta.href}
              variant={data.primaryCta.variant ?? "primary"}
              ctaLocation="hero_primary"
            >
              {data.primaryCta.label}
            </CampaignCtaLink>
            {data.secondaryCta ? (
              <CampaignCtaLink
                href={data.secondaryCta.href}
                variant={data.secondaryCta.variant ?? "secondary"}
                ctaLocation="hero_secondary"
              >
                {data.secondaryCta.label}
              </CampaignCtaLink>
            ) : null}
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-6 shadow-card">
          <p className="eyebrow mb-3">Keep the product, rebuild the foundation</p>
          <p className="text-ink-soft">
            vygo preserves the validated product your users rely on and re-engineers the secure,
            scalable foundation beneath it — then hands off full IP.
          </p>
        </div>
      </div>
    </section>
  );
}
