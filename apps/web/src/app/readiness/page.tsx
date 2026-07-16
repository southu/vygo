import type { Metadata } from "next";
import { readinessContent } from "@/content/readiness";
import { ReadinessFlow } from "@/components/readiness/ReadinessFlow";

export const metadata: Metadata = {
  title: "Readiness Check",
  description:
    "Answer a few questions and get a read-only diagnostic prompt tailored to how you build — production standards, no secrets.",
  robots: { index: true, follow: true },
};

export default function ReadinessPage() {
  const c = readinessContent.page;
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {c.title}
          </h1>
          <p className="mt-4 text-base text-muted sm:text-lg">{c.body}</p>
          <ReadinessFlow />
        </div>
      </section>
    </main>
  );
}
