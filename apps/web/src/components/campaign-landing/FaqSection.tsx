import { SectionHeading } from "@/components/SectionHeading";
import type { FaqSectionData } from "@/lib/campaign/types";

/**
 * FAQ built on native <details>/<summary> so it is keyboard operable and fully
 * usable even when nonessential scripts are delayed.
 */
export function FaqSection({ id, data }: { id: string; data: FaqSectionData }) {
  return (
    <section
      id={id}
      data-campaign-section="faq"
      data-section-id={id}
      className="section-pad border-t border-border"
    >
      <div className="container-page">
        <SectionHeading eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <div className="mt-8 max-w-3xl divide-y divide-border rounded-card border border-border bg-surface">
          {data.items.map((item) => (
            <details key={item.question} className="group px-5 py-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4 rounded-sm text-left">
                <h3 className="font-display text-base font-semibold text-ink">{item.question}</h3>
                <span
                  aria-hidden="true"
                  className="text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-ink-soft">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
