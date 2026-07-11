import type { Metadata } from "next";
import { site } from "@/content/site";
import { securityContent } from "@/content/security";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { SecurityControlGrid } from "@/components/SecurityControlGrid";

export const metadata: Metadata = {
  title: site.metadata.securityTitle,
  description: site.metadata.securityDescription,
};

export default function SecurityPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">Security & compliance readiness</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
            {securityContent.hero.headline}
          </h1>
          <p className="mt-5 text-lg text-muted">{securityContent.hero.body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={securityContent.cta.href}>{securityContent.cta.label}</CtaLink>
            <CtaLink href={securityContent.secondaryCta.href} variant="secondary">
              {securityContent.secondaryCta.label}
            </CtaLink>
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page">
          <SectionHeading title="Control areas built into the engineering work" />
          <div className="mt-10">
            <SecurityControlGrid sections={securityContent.sections} />
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <SectionHeading title="Compliance language we stand behind" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="card">
              <h3 className="font-display text-base font-semibold text-green-dark">We use</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {securityContent.language.use.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink">We avoid</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {securityContent.language.avoid.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 rounded-card border border-border bg-canvas p-5 text-sm text-ink-soft">
            {securityContent.complianceNote}
          </p>
        </div>
      </section>
    </main>
  );
}
