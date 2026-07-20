import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEmploymentType, getRole, listAllRoles, type CareerRole } from "@/content/careers";
import { site } from "@/content/site";
import { ctas, ctaHrefs } from "@/content/ctas";
import { CtaLink } from "@/components/CtaLink";
import { RoleApplyForm } from "@/components/RoleApplyForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Static export pre-renders a page for every role — open and closed. Open roles
 * render the full description plus the Apply form; the closed role renders a
 * graceful "no longer open" state (no crash, no raw error). Unknown ids 404.
 */
export function generateStaticParams() {
  return listAllRoles().map((role) => ({ id: role.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const role = getRole(id);
  if (!role) {
    return { title: "Role not found", robots: { index: false, follow: false } };
  }
  const closed = role.status !== "open";
  return {
    title: closed ? `${role.title} (closed)` : role.title,
    description: role.summary,
    robots: closed ? { index: false, follow: false } : undefined,
  };
}

function ClosedRoleState({ role }: { role: CareerRole }) {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Careers</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">{role.title}</h1>
          <div
            className="mt-8 rounded-card border border-border bg-surface p-6"
            data-testid="role-closed"
          >
            <h2 className="font-display text-xl font-semibold text-ink">
              This role is no longer open
            </h2>
            <p className="mt-3 text-sm text-muted">
              Thanks for your interest in the {role.title} role. We&apos;re no longer accepting
              applications for this position, but new roles open regularly.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <CtaLink href="/careers" variant="secondary">
                See all open roles
              </CtaLink>
              <CtaLink href={ctaHrefs.waitlist}>{ctas.applyNextOpening}</CtaLink>
            </div>
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <Link
              href="/careers"
              className="text-sm font-semibold text-purple hover:text-purple-dark"
            >
              ← Back to all roles
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function RoleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const role = getRole(id);

  if (!role) {
    notFound();
  }

  if (role.status !== "open") {
    return <ClosedRoleState role={role} />;
  }

  const paragraphs = role.description
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main id="main-content">
      <article className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Careers</p>
          <h1
            className="mt-4 font-display text-4xl font-bold sm:text-5xl"
            data-testid="role-detail-title"
          >
            {role.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-ink-soft">
            <span data-role-location>{role.location}</span>
            <span aria-hidden="true">·</span>
            <span data-role-type>{formatEmploymentType(role.type)}</span>
          </div>

          <div className="prose-page mt-8" data-testid="role-detail-description">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div
            id="apply"
            className="mt-12 rounded-card border border-purple/30 bg-purple-soft/30 p-6 sm:p-8"
            data-testid="role-apply"
          >
            <h2 className="font-display text-2xl font-bold text-ink">Apply for this role</h2>
            <p className="mt-3 text-sm text-muted">
              Tell us a little about yourself and why the {role.title} role is a fit. A member of
              the {site.name} team reviews every application.
            </p>
            <div className="mt-6">
              <RoleApplyForm roleId={role.id} roleTitle={role.title} />
            </div>
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <Link
              href="/careers"
              className="text-sm font-semibold text-purple hover:text-purple-dark"
            >
              ← Back to all roles
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}
