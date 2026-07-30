import { CtaLink } from "@/components/CtaLink";
import type { ClosingCtaSectionData } from "@/lib/campaign/types";

/** Optional closing call-to-action band. */
export function ClosingCtaSection({ id, data }: { id: string; data: ClosingCtaSectionData }) {
  return (
    <section
      id={id}
      data-campaign-section="closingCta"
      data-section-id={id}
      className="section-pad border-t border-border bg-trust text-white"
    >
      <div className="container-page max-w-3xl">
        {data.eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-purple-soft">
            {data.eyebrow}
          </p>
        ) : null}
        <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{data.title}</h2>
        {data.body ? <p className="mt-4 text-lg text-white/80">{data.body}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <CtaLink href={data.primaryCta.href} variant={data.primaryCta.variant ?? "on-dark"}>
            {data.primaryCta.label}
          </CtaLink>
          {data.secondaryCta ? (
            <CtaLink
              href={data.secondaryCta.href}
              variant={data.secondaryCta.variant ?? "ghost-on-dark"}
            >
              {data.secondaryCta.label}
            </CtaLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
