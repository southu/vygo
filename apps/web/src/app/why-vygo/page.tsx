import type { Metadata } from "next";
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
      <section className="section-pad">
        <div className="container-page max-w-4xl">
          <p className="eyebrow">{whyVygoContent.hero.eyebrow}</p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem]">
            {whyVygoContent.hero.quote}
          </h1>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface">
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

      <section className="section-pad border-t border-border">
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
    </main>
  );
}
