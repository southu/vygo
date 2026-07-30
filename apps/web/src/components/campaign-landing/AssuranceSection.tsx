import { SectionHeading } from "@/components/SectionHeading";
import type { AssuranceSectionData } from "@/lib/campaign/types";

/** Security and compliance assurances. */
export function AssuranceSection({ id, data }: { id: string; data: AssuranceSectionData }) {
  return (
    <section
      id={id}
      data-campaign-section="assurance"
      data-section-id={id}
      className="section-pad border-t border-border bg-surface"
    >
      <div className="container-page">
        <SectionHeading eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <ul className="mt-8 flex flex-wrap gap-3">
          {data.items.map((item) => (
            <li
              key={item}
              className="rounded-full border border-border bg-canvas px-4 py-2 text-sm text-ink-soft"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
