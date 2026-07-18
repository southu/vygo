import type { Metadata } from "next";
import { GuideOffer } from "@/components/vibe-coding/GuideOffer";
import { guideOffer } from "@/content/guide-offer";
import { guideDocs, guidePackEntryHref, isRenderedGuideDoc } from "@/content/ratchet-guide";
import { readGuidePackManifest } from "@/lib/guide-source";

const manifest = readGuidePackManifest();

export const metadata: Metadata = {
  title: "Ratchet system guide",
  description: guideOffer.intro,
};

/**
 * Public guide landing at /guide — downloadable pack, readable docs, and the
 * optional guide_updates notify form. Signup never gates content or download.
 */
export default function GuidePage() {
  return (
    <main id="main-content" data-page="guide">
      <section className="section-pad" data-section="guide-hero">
        <div className="container-page max-w-3xl">
          <p className="eyebrow">Free system guide</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">{guideOffer.title}</h1>
          <p className="mt-6 text-lg text-muted">{guideOffer.intro}</p>
        </div>
      </section>

      {/* Download CTAs + optional notify form (never gates reading or download) */}
      <GuideOffer />

      <section className="section-pad border-t border-border bg-surface" data-section="guide-docs">
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">Read the guide</h2>
          <p className="mt-4 text-muted">
            The six key documents of the {manifest.version} pack, rendered as pages on this site and
            chained prev/next in read order. Reading never requires the notify form.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {guideDocs.map((doc, index) => (
              <li key={doc.slug}>
                <a
                  href={doc.href}
                  className="card block h-full transition-colors hover:border-purple"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {index + 1} of {guideDocs.length}
                  </p>
                  <h3 className="mt-2 font-display text-base font-semibold">{doc.title}</h3>
                  <p className="mt-2 text-sm text-muted">{doc.blurb}</p>
                </a>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <a href={guideDocs[0].href} className="btn-secondary" data-guide-next>
              Start reading: {guideDocs[0].title} →
            </a>
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-border" data-section="pack-structure">
        <div className="container-page max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold">Pack contents</h2>
            <span className="chip" data-pack-version>
              {manifest.version}
            </span>
          </div>
          <p className="mt-4 text-muted">
            Every document in the sanitized pack, in manifest order. Entries marked “Guide page” are
            rendered on this site; the rest open as the pack&apos;s plain markdown or self-contained
            HTML, served alongside it.
          </p>
          <ul className="mt-8 space-y-3">
            {manifest.documents.map((entry) => {
              const rendered = isRenderedGuideDoc(entry.filename);
              return (
                <li key={entry.filename} className="card">
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={guidePackEntryHref(entry.filename)}
                      className="font-mono text-sm font-semibold text-purple hover:underline"
                    >
                      {entry.filename}
                    </a>
                    <span className="chip" data-entry-kind={rendered ? "page" : "file"}>
                      {rendered ? "Guide page" : "Pack file"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{entry.title}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
