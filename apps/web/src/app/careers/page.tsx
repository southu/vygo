import type { Metadata } from "next";
import { listOpenRoles } from "@/content/careers";
import { SectionHeading } from "@/components/SectionHeading";
import { CareersListLive } from "@/components/CareersListLive";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Open roles at Vygo — production engineering for AI-built software. Browse current openings and apply to join the team building the Vygo readiness product.",
};

/**
 * Public careers list. The static shell renders every OPEN seed role; on the
 * client it refreshes from GET /api/roles (see CareersListLive) so admin-created
 * roles appear and closed roles drop off without a rebuild. Each role links to
 * its detail page at /careers/:id.
 */
export default function CareersPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page">
          <SectionHeading
            as="h1"
            eyebrow="Careers"
            title="Open roles at Vygo"
            intro="We're a small, senior team building production engineering for AI-built software. If you want to ship work that reaches production and matters, we'd love to hear from you."
          />

          <CareersListLive initialRoles={listOpenRoles()} />
        </div>
      </section>
    </main>
  );
}
