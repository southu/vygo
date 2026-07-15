import { CtaLink } from "./CtaLink";

type HardenCalloutProps = {
  eyebrow: string;
  headline: string;
  body: string;
  /** Repository-supplied best-for supporting line (not a tier card). */
  bestFor: string;
  offerLine: string;
  cta: { label: string; href: string };
};

/**
 * Compact horizontal callout for the focused vygo Harden offer.
 * Quieter than the hero; side-by-side on desktop, stacked on mobile.
 */
export function HardenCallout({
  eyebrow,
  headline,
  body,
  bestFor,
  offerLine,
  cta,
}: HardenCalloutProps) {
  return (
    <aside
      className="mt-8 overflow-hidden rounded-card border border-purple/20 bg-purple-soft/50 shadow-card"
      data-section="harden-callout"
      aria-labelledby="harden-callout-heading"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:p-6">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{eyebrow}</p>
          <h3
            id="harden-callout-heading"
            className="mt-2 max-w-2xl text-balance font-display text-xl font-bold tracking-tight text-ink sm:text-2xl"
          >
            {headline}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{body}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{bestFor}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-purple/15 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:w-[min(100%,18.5rem)] lg:flex-col lg:items-stretch lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="text-sm font-semibold leading-snug text-green-dark sm:max-w-xs lg:max-w-none">
            {offerLine}
          </p>
          <div className="shrink-0 sm:self-center lg:self-stretch">
            <CtaLink href={cta.href} className="w-full sm:w-auto lg:w-full">
              {cta.label}
            </CtaLink>
          </div>
        </div>
      </div>
    </aside>
  );
}
