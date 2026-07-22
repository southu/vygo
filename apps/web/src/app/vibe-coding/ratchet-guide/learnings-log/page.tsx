import type { Metadata } from "next";
import {
  readLearningsLog,
  incorporatedEntries,
  pendingEntries,
  type LearningEntry,
} from "@/lib/learnings-source";
import { readGuidePackManifest } from "@/lib/guide-source";

const log = readLearningsLog();
const incorporated = incorporatedEntries(log);
const pending = pendingEntries(log);
const version = readGuidePackManifest().version;

export const metadata: Metadata = {
  title: "Learnings log — Ratchet system guide",
  description:
    "Append-only log of Ratchet improvements captured during delivery: which were incorporated into the guide (with date and source), and which are pending with a reason.",
};

function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="break-all font-mono text-sm text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
      data-learnings-source
      rel="nofollow"
    >
      {href}
    </a>
  );
}

function IncorporatedCard({ entry }: { entry: LearningEntry }) {
  return (
    <li className="card" data-learning-id={entry.id} data-learning-status="incorporated">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="chip border-green/40 bg-green/10 font-semibold text-green-dark"
          data-status="incorporated"
        >
          Incorporated
        </span>
        <span className="text-sm text-muted">
          Incorporated <time dateTime={entry.incorporated_date}>{entry.incorporated_date}</time>
        </span>
        <span className="text-sm text-muted">
          · Shipped <time dateTime={entry.date}>{entry.date}</time>
        </span>
      </div>
      <p className="mt-3 text-ink-soft">{entry.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>
          Guide sections:{" "}
          <span className="font-medium text-ink">{entry.affected_sections.join(", ")}</span>
        </span>
      </div>
      <p className="mt-2 text-sm">
        Source: <SourceLink href={entry.source_link} />
      </p>
    </li>
  );
}

function PendingCard({ entry }: { entry: LearningEntry }) {
  // The one-line reason a pending learning was not folded into the guide is
  // carried in the summary after "Pending:"; surface it as an explicit reason.
  const [claim, reasonTail] = entry.summary.split(/Pending:\s*/i);
  const reason = reasonTail?.trim();
  return (
    <li className="card" data-learning-id={entry.id} data-learning-status="pending">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="chip border-amber/40 bg-amber/10 font-semibold text-amber-dark"
          data-status="pending"
        >
          Pending
        </span>
        <span className="text-sm text-muted">
          Identified <time dateTime={entry.date}>{entry.date}</time>
        </span>
      </div>
      <p className="mt-3 text-ink-soft">{claim?.trim()}</p>
      {reason ? (
        <p className="mt-2 text-sm text-muted" data-learning-reason>
          <strong className="text-ink">Reason not incorporated:</strong> {reason}
        </p>
      ) : null}
      <p className="mt-2 text-sm">
        Source: <SourceLink href={entry.source_link} />
      </p>
    </li>
  );
}

export default function RatchetLearningsLogPage() {
  return (
    <main id="main-content" data-guide-doc="learnings-log">
      <section className="section-pad" data-section="doc-header">
        <div className="container-page max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted" data-breadcrumb>
            <a href="/vibe-coding" className="font-medium text-purple hover:underline">
              Vibe coding
            </a>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <a
              href="/vibe-coding/ratchet-guide"
              className="font-medium text-purple hover:underline"
            >
              Ratchet system guide
            </a>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span aria-current="page">Learnings log</span>
          </nav>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Ratchet system guide · {version}</p>
            <span
              className="chip border-green/40 bg-green/10 text-green-dark"
              data-status="available"
            >
              Available
            </span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Learnings log</h1>
          <p className="mt-6 text-lg text-muted">
            An append-only record of recent Ratchet improvements captured during delivery. Each
            learning is either <strong>incorporated</strong> into this guide — with the date it was
            folded in and a source link — or left <strong>pending</strong> with a one-line reason.
            Entries are never deleted or rewritten; status only moves forward.
          </p>
        </div>
      </section>

      <section className="section-pad border-t border-border" data-section="incorporated">
        <div className="container-page max-w-4xl">
          <h2 className="font-display text-2xl font-bold">
            Incorporated into the guide ({incorporated.length})
          </h2>
          <p className="mt-3 text-muted">
            Every improvement below is reflected in the guide body and listed in the guide&apos;s{" "}
            <a
              href="/vibe-coding/ratchet-guide#changelog"
              className="text-purple underline decoration-purple/40 underline-offset-2 hover:decoration-purple"
            >
              Changelog
            </a>
            .
          </p>
          {incorporated.length > 0 ? (
            <ul className="mt-6 space-y-4">
              {incorporated.map((entry) => (
                <IncorporatedCard key={entry.id} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-muted">No incorporated learnings yet.</p>
          )}
        </div>
      </section>

      {pending.length > 0 ? (
        <section className="section-pad border-t border-border bg-surface" data-section="pending">
          <div className="container-page max-w-4xl">
            <h2 className="font-display text-2xl font-bold">Pending ({pending.length})</h2>
            <p className="mt-3 text-muted">
              Identified but deliberately not folded into the public guide. These do not appear in
              the guide&apos;s Changelog as incorporated.
            </p>
            <ul className="mt-6 space-y-4">
              {pending.map((entry) => (
                <PendingCard key={entry.id} entry={entry} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section-pad border-t border-border" data-section="back">
        <div className="container-page max-w-4xl">
          <a href="/vibe-coding/ratchet-guide" className="btn-secondary" data-back-to-guide>
            &larr; Back to the Ratchet system guide
          </a>
        </div>
      </section>
    </main>
  );
}
