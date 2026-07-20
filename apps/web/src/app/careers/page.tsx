import type { Metadata } from "next";
import { listOpenRoles } from "@/content/careers";
import { ctas, ctaHrefs } from "@/content/ctas";
import { SectionHeading } from "@/components/SectionHeading";
import { RoleCard } from "@/components/RoleCard";
import { CtaLink } from "@/components/CtaLink";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Open roles at Vygo — production engineering for AI-built software. Browse current openings and apply to join the team building the Vygo readiness product.",
};

/**
 * Public careers list. Renders every OPEN role (closed roles are excluded),
 * mirroring GET /api/roles. Each role links to its detail page at /careers/:id.
 */
export default function CareersPage() {
  const roles = listOpenRoles();

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

          {roles.length > 0 ? (
            <div
              className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="roles-list"
            >
              {roles.map((role) => (
                <RoleCard key={role.id} role={role} />
              ))}
            </div>
          ) : (
            <div className="mt-10 card max-w-2xl" data-testid="roles-empty">
              <h2 className="font-display text-xl font-semibold">No open roles right now</h2>
              <p className="mt-3 text-sm text-muted">
                We don&apos;t have any open positions at the moment, but we&apos;re always glad to
                hear from exceptional engineers, designers, and operators.
              </p>
              <div className="mt-6">
                <CtaLink href={ctaHrefs.waitlist}>{ctas.applyNextOpening}</CtaLink>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
