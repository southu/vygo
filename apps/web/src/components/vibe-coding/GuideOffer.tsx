import { guideOffer } from "@/content/guide-offer";
import { GuideNotifyBlock } from "./GuideNotifyBlock";

/**
 * "Get the guide" offer block shared by the /vibe-coding hub and the
 * /vibe-coding/ratchet-guide index. Server-rendered into the static export,
 * so the whole offer — assurances and CTAs — is in the page source with no
 * interaction required. CTAs are plain anchors: the zip is a static build
 * artifact and the other two are existing guide routes; no client-side
 * navigation, no login, no auth gate.
 *
 * The optional notify block sits directly under the offer; it never gates
 * reading or downloading the guide.
 */
export function GuideOffer() {
  return (
    <>
      <section className="section-pad border-t border-border" data-section="guide-offer">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">{guideOffer.eyebrow}</p>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            {guideOffer.heading}: {guideOffer.title}
          </h2>
          <p className="mt-4 text-lg text-muted">{guideOffer.intro}</p>
          <ul className="mt-6 space-y-2">
            {guideOffer.assurances.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-ink-soft">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green"
                  aria-hidden="true"
                />
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              className="btn-primary"
              href={guideOffer.ctas.startFree.href}
              data-offer-cta="start-free"
            >
              {guideOffer.ctas.startFree.label}
            </a>
            <a
              className="btn-secondary"
              href={guideOffer.ctas.readGuide.href}
              data-offer-cta="read-guide"
            >
              {guideOffer.ctas.readGuide.label}
            </a>
            <a
              className="btn-secondary"
              href={guideOffer.ctas.checklist.href}
              data-offer-cta="rebuild-checklist"
            >
              {guideOffer.ctas.checklist.label}
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">{guideOffer.note}</p>
        </div>
      </section>
      <GuideNotifyBlock />
    </>
  );
}
