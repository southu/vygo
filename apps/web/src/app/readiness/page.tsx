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
  const s3 = readinessContent.stage3;
  return (
    <main
      id="main-content"
      className="readiness-assessment-page"
      data-visual-system="results-shared"
    >
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {c.title}
          </h1>
          <p className="mt-4 text-base text-muted sm:text-lg">{c.body}</p>
          {/* Prefetch link to reference the token issuance flow in the page source */}
          <link rel="prefetch" href="/api/readiness/token" />
          {/* Prefetch link to reference the submission status poll flow in the page source */}
          <link rel="prefetch" href="/api/readiness/status" />
          <ReadinessFlow />
          {/*
            Static Stage 3 paste-back shell in the HTML document so GET /readiness
            always contains a large paste textarea in page source (acceptance).
            The interactive client flow owns the live Stage 3 UI with the same
            data-testid after hydration; this shell stays hidden and inert.
            The paste path posts the delimited results block to the same ingest
            endpoint the customer's AI uses directly (POST /api/readiness/submit)
            with the same per-session submission token.
          */}
          <div
            className="sr-only"
            aria-hidden="true"
            data-readiness-stage3-shell="true"
            data-testid="readiness-stage3"
          >
            <h2>{s3.title}</h2>
            <p>{s3.body}</p>
            <p>{s3.noSendHelper}</p>
            <form
              action="/api/readiness/submit"
              method="post"
              data-submit-url="/api/readiness/submit"
              data-testid="readiness-paste-form"
            >
              <label htmlFor="readiness-paste-shell">{s3.textareaLabel}</label>
              <textarea
                id="readiness-paste-shell"
                name="paste"
                rows={16}
                readOnly
                tabIndex={-1}
                placeholder={s3.textareaPlaceholder}
                data-testid="readiness-paste-textarea"
                defaultValue=""
              />
              <button type="submit" disabled tabIndex={-1} data-testid="readiness-paste-submit">
                {s3.submit}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
