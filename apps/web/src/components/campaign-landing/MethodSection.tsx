import { SectionHeading } from "@/components/SectionHeading";
import { CampaignMedia } from "./CampaignMedia";
import type { MethodSectionData } from "@/lib/campaign/types";

/** Ordered method steps, with an optional responsive content image. */
export function MethodSection({ id, data }: { id: string; data: MethodSectionData }) {
  return (
    <section
      id={id}
      data-campaign-section="method"
      data-section-id={id}
      className="section-pad border-t border-border"
    >
      <div className="container-page grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-start">
        <div>
          <SectionHeading eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
          <ol className="mt-10 space-y-6">
            {data.steps.map((step, index) => (
              <li key={step.name} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-soft font-display text-sm font-bold text-purple-dark"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">{step.name}</h3>
                  <p className="mt-1 text-ink-soft">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {data.media ? (
          <div className="rounded-card border border-border bg-surface p-3 shadow-card lg:sticky lg:top-24">
            <CampaignMedia image={data.media} className="h-auto w-full rounded-lg" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
