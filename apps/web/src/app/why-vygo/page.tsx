import type { Metadata } from "next";
import { CtaLink } from "@/components/CtaLink";
import { SectionHeading } from "@/components/SectionHeading";
import { site } from "@/content/site";
import { whyVygoContent } from "@/content/why-vygo";

export const metadata: Metadata = {
  title: site.metadata.whyVygoTitle,
  description: site.metadata.whyVygoDescription,
};

export default function WhyVygoPage() {
  return (
    <main id="main-content">
      <section className="section-pad" data-section="hero">
        <div className="container-page max-w-4xl">
          <p className="eyebrow">{whyVygoContent.hero.eyebrow}</p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem]">
            {whyVygoContent.hero.quote}
          </h1>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface" data-section="market">
        <div className="container-page">
          <SectionHeading title={whyVygoContent.market.heading} />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {whyVygoContent.market.stats.map((stat) => (
              <li key={stat.value} className="card">
                <p className="font-display text-3xl font-bold text-purple">{stat.value}</p>
                <p className="mt-3 text-sm text-muted">{stat.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad border-t border-border" data-section="providers">
        <div className="container-page">
          <SectionHeading
            title={whyVygoContent.providers.heading}
            intro={whyVygoContent.providers.intro}
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {whyVygoContent.providers.options.map((option) => (
              <article
                key={option.eyebrow}
                className={
                  option.featured
                    ? "rounded-card bg-trust p-6 text-white shadow-card sm:p-8"
                    : "card sm:p-8"
                }
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.08em] ${
                    option.featured ? "text-green" : "text-muted"
                  }`}
                >
                  {option.eyebrow}
                </p>
                <h3
                  className={`mt-3 font-display text-3xl font-bold ${
                    option.featured ? "text-white" : "text-ink"
                  }`}
                >
                  {option.price}
                </h3>
                <p className={`mt-4 ${option.featured ? "text-white/80" : "text-muted"}`}>
                  {option.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface" data-section="comparison">
        <div className="container-page">
          <SectionHeading
            title={whyVygoContent.comparison.heading}
            intro={whyVygoContent.comparison.intro}
          />
          <div className="mt-10 overflow-x-auto rounded-card border border-border bg-canvas shadow-card">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead className="bg-trust text-white">
                <tr>
                  {whyVygoContent.comparison.columns.map((column) => (
                    <th key={column} scope="col" className="px-5 py-4 text-sm font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {whyVygoContent.comparison.rows.map((row) => (
                  <tr key={row[0]} className="border-t border-border first:border-t-0">
                    {row.map((cell, index) =>
                      index === 0 ? (
                        <th key={cell} scope="row" className="px-5 py-4 text-sm font-semibold">
                          {cell}
                        </th>
                      ) : (
                        <td
                          key={cell}
                          className={`px-5 py-4 text-sm ${index === 2 ? "font-medium text-ink" : "text-muted"}`}
                        >
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-border" data-section="claims">
        <div className="container-page">
          <SectionHeading title={whyVygoContent.claims.heading} />
          <ol className="mt-10 grid gap-4 md:grid-cols-2">
            {whyVygoContent.claims.items.map((claim, index) => (
              <li key={claim.title} className="card sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-purple">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 font-display text-xl font-semibold">{claim.title}</h3>
                <p className="mt-3 text-muted">{claim.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="section-pad border-t border-border bg-trust text-white"
        data-section="cta"
      >
        <div className="container-page max-w-3xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            {whyVygoContent.cta.heading}
          </h2>
          <p className="mt-4 text-lg text-white/80">{whyVygoContent.cta.body}</p>
          <div className="mt-8">
            <CtaLink href={whyVygoContent.cta.href} variant="on-dark">
              {whyVygoContent.cta.label}
            </CtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}
