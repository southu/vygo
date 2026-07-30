import { SectionHeading } from "@/components/SectionHeading";
import { WaitlistForm } from "@/components/WaitlistForm";
import type { WaitlistSectionData } from "@/lib/campaign/types";

/**
 * The campaign's single, visually dominant conversion action: an on-page
 * waitlist application. It renders the site's live, production waitlist form —
 * the same server-validated, Turnstile-gated flow used at /waitlist — so the
 * application is submitted (with preserved attribution) and its success state
 * is announced without navigating away from the landing page.
 *
 * `fullUrlAttribution` preserves the landing page's full query string in the
 * submitted attribution, so supported click identifiers (gclid, fbclid, …)
 * travel with the request alongside the UTM object and referrer — none of them
 * exposed as editable form controls.
 */
export function WaitlistApplicationSection({
  id,
  data,
}: {
  id: string;
  data: WaitlistSectionData;
}) {
  return (
    <section
      id={id}
      data-campaign-section="waitlist"
      data-section-id={id}
      className="section-pad border-t border-border bg-surface"
    >
      <div className="container-page">
        <div className="mx-auto max-w-2xl">
          <SectionHeading eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
          <div className="mt-8">
            <WaitlistForm mode="page" fullUrlAttribution />
          </div>
        </div>
      </div>
    </section>
  );
}
