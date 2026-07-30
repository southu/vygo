import { SectionHeading } from "@/components/SectionHeading";
import type { BenefitsSectionData } from "@/lib/campaign/types";

/** Value-proposition grid. */
export function BenefitsSection({ id, data }: { id: string; data: BenefitsSectionData }) {
  return (
    <section
      id={id}
      data-campaign-section="benefits"
      data-section-id={id}
      className="section-pad border-t border-border bg-surface"
    >
      <div className="container-page">
        <SectionHeading eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {data.items.map((item) => (
            <li key={item.title} className="card">
              <h3 className="font-display text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
