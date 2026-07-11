import type { Metadata } from "next";
import { site } from "@/content/site";
import { methodContent } from "@/content/method";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";

export const metadata: Metadata = {
  title: site.metadata.methodTitle,
  description: site.metadata.methodDescription,
};

export default function MethodPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">Method</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
            {methodContent.hero.heading}
          </h1>
          <p className="mt-6 text-lg font-medium text-ink-soft rail">
            {methodContent.hero.principle}
          </p>
          <p className="mt-4 text-sm text-muted">{methodContent.hero.cutoverNote}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={methodContent.cta.href}>{methodContent.cta.label}</CtaLink>
            <CtaLink href={methodContent.secondaryCta.href} variant="secondary">
              {methodContent.secondaryCta.label}
            </CtaLink>
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface">
        <div className="container-page space-y-6">
          {methodContent.steps.map((step, index) => (
            <article key={step.title} className="card">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-purple text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold">{step.title}</h2>
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    {step.weeks}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-ink-soft">{step.objectives}</p>
              <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Activities</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {step.activities.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Customer involvement</h3>
                  <p className="mt-2 text-sm text-muted">{step.involvement}</p>
                  <h3 className="mt-4 text-sm font-semibold text-ink">Deliverables</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {step.deliverables.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Typical risks</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {step.risks.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                  <h3 className="mt-4 text-sm font-semibold text-ink">Decision gate</h3>
                  <p className="mt-2 text-sm text-muted">{step.gate}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHeading title={methodContent.tierMatrix.heading} />
          <div className="mt-8 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 font-semibold">Capability</th>
                  <th className="py-3 pr-4 font-semibold">Launch</th>
                  <th className="py-3 pr-4 font-semibold">Scale</th>
                  <th className="py-3 font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {methodContent.tierMatrix.rows.map((row) => (
                  <tr key={row.capability} className="border-b border-border/70">
                    <td className="py-3 pr-4 font-medium text-ink">{row.capability}</td>
                    <td className="py-3 pr-4 text-muted">{row.launch}</td>
                    <td className="py-3 pr-4 text-muted">{row.scale}</td>
                    <td className="py-3 text-muted">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid gap-4 md:hidden">
            {methodContent.tierMatrix.rows.map((row) => (
              <article key={row.capability} className="card">
                <h3 className="font-display text-base font-semibold">{row.capability}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="font-semibold text-ink">Launch</dt>
                    <dd className="text-muted">{row.launch}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Scale</dt>
                    <dd className="text-muted">{row.scale}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Enterprise</dt>
                    <dd className="text-muted">{row.enterprise}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
