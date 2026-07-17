import type { Metadata } from "next";
import { readinessContent } from "@/content/readiness";
import { ManualQuestionnaire } from "@/components/readiness/ManualQuestionnaire";

export const metadata: Metadata = {
  title: "Readiness fallback questionnaire",
  description:
    "Plain-language fallback questionnaire when you cannot run the diagnostic agent. Maps to the same readiness report schema with source=manual and confidence=low.",
  robots: { index: false, follow: false },
};

export default function ReadinessFallbackPage() {
  const c = readinessContent.fallback;
  return (
    <main id="main-content" className="readiness-assessment-page">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {c.title}
          </h1>
          <p className="mt-5 text-lg text-muted">{c.body}</p>
          <ManualQuestionnaire />
        </div>
      </section>
    </main>
  );
}
