"use client";

import { useEffect, useState } from "react";
import type { GuideLearningsResponse, PublicLearning } from "@vygo/validation";
import { apiUrl } from "@/lib/api";

/**
 * Ratchet guide-progress panel. Rendered with a build-time snapshot (so the
 * counts, rows, and last-updated date are present in static page source) and
 * then reconciled against the live GET /api/guide/learnings on load — a plain
 * one-shot fetch, no polling. A learning recorded via POST therefore appears as
 * pending within one page refresh.
 */
export function GuideProgressPanel({ initial }: { initial: GuideLearningsResponse }) {
  const [data, setData] = useState<GuideLearningsResponse>(initial);

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/guide/learnings"), {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<GuideLearningsResponse>) : null))
      .then((live) => {
        // Only replace when the live payload is well-formed; otherwise keep the
        // build-time snapshot so the panel never blanks out.
        if (live && live.counts && Array.isArray(live.learnings)) {
          setData(live);
        }
      })
      .catch(() => {
        /* offline / endpoint unavailable: keep the snapshot already rendered */
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <section className="section-pad" data-section="guide-progress-summary">
        <div className="container-page max-w-4xl">
          <p className="eyebrow">Ratchet system guide · progress</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Guide progress</h1>
          <p className="mt-6 text-lg text-muted">
            Live view of the append-only learnings log behind the Ratchet system guide: how many
            improvements have been incorporated into the guide, how many are still pending, and the
            date the guide was last updated. This panel reads the canonical store on every load.
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="card" data-stat="incorporated">
              <dt className="text-sm font-semibold uppercase tracking-wide text-muted">
                Incorporated
              </dt>
              <dd
                className="mt-2 font-display text-4xl font-bold text-green-dark"
                data-guide-count="incorporated"
              >
                {data.counts.incorporated}
              </dd>
            </div>
            <div className="card" data-stat="pending">
              <dt className="text-sm font-semibold uppercase tracking-wide text-muted">Pending</dt>
              <dd
                className="mt-2 font-display text-4xl font-bold text-amber-dark"
                data-guide-count="pending"
              >
                {data.counts.pending}
              </dd>
            </div>
            <div className="card" data-stat="last-updated">
              <dt className="text-sm font-semibold uppercase tracking-wide text-muted">
                Guide last updated
              </dt>
              <dd className="mt-2 font-display text-2xl font-bold">
                <time dateTime={data.guide_last_updated} data-guide-last-updated>
                  {data.guide_last_updated || "—"}
                </time>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface" data-section="learnings">
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">
            Learnings <span data-guide-total>({data.learnings.length})</span>
          </h2>
          <p className="mt-3 text-muted">
            Every learning captured for the guide, with its source and the guide section(s) it
            affects. Incorporated learnings are already reflected in the guide body; pending ones
            are recorded but not yet folded in.
          </p>

          {data.learnings.length > 0 ? (
            <ul className="mt-6 space-y-4" data-learnings-list>
              {data.learnings.map((learning) => (
                <LearningRow key={learning.id} learning={learning} />
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-muted">No learnings recorded yet.</p>
          )}
        </div>
      </section>
    </>
  );
}

function LearningRow({ learning }: { learning: PublicLearning }) {
  const incorporated = learning.status === "incorporated";
  return (
    <li className="card" data-learning-id={learning.id} data-learning-status={learning.status}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            incorporated
              ? "chip border-green/40 bg-green/10 font-semibold text-green-dark"
              : "chip border-amber/40 bg-amber/10 font-semibold text-amber-dark"
          }
          data-status={learning.status}
        >
          {incorporated ? "Incorporated" : "Pending"}
        </span>
        <span className="text-sm text-muted">
          Captured <time dateTime={learning.date}>{learning.date}</time>
        </span>
      </div>

      <p className="mt-3 text-ink-soft" data-learning-summary>
        {learning.summary}
      </p>

      <div className="mt-3 text-sm text-muted">
        Guide sections:{" "}
        <span className="font-medium text-ink" data-learning-sections>
          {learning.sections.join(", ")}
        </span>
      </div>

      <p className="mt-2 text-sm">
        Source:{" "}
        <a
          href={learning.source}
          className="break-all font-mono text-sm text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
          data-learning-source
          rel="nofollow"
        >
          {learning.source}
        </a>
      </p>
    </li>
  );
}
