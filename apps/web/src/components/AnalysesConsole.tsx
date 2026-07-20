"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";

/**
 * Analysis history view.
 *
 * On load it hits the idempotent, non-destructive demo fixture
 * (GET /api/analyses/demo), which seeds a fixed demo user (demo@vygo.ai) the
 * first time and returns the current state thereafter. It renders every past
 * analysis run GROUPED BY PROJECT — each entry showing its project label, run
 * timestamp, and status. Within each project the most recent COMPLETED run is
 * surfaced as that project's current result, while older runs stay listed.
 *
 * Each completed entry links to the EXISTING analysis-detail/results component
 * (SnapshotView) at /readiness/snapshot?id=<snapshotId> — the same UI/route a
 * fresh run lands on. It never renders a parallel results view.
 *
 * No secrets, no auth: the fixture is a documented demo namespace only. Real
 * users' data is never touched.
 */

const DEMO_USER = "demo@vygo.ai";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fallback snapshot ids for demo fixture rows that predate stored `snapshotId`.
 * Keyed by the fixture marker each seeded submission carries. Kept in sync with
 * DEMO_SNAPSHOT_IDS in api/readiness/[op].ts.
 */
const FIXTURE_SNAPSHOT_IDS: Record<string, string> = {
  legacy_single_analysis: "00000000-0000-4000-a000-0000000000e3",
  default_project_rerun: "00000000-0000-4000-a000-0000000000e2",
  second_project_analysis: "00000000-0000-4000-a000-0000000000e1",
};

/** Completed-status allowlist mirroring the server (isCompletedStatusEdge). */
const COMPLETED_STATUSES = new Set([
  "completed",
  "complete",
  "done",
  "finished",
  "success",
  "succeeded",
  "ready",
  "scored",
  "closed",
]);

type Analysis = {
  id: string;
  user: string;
  project: string;
  status: string;
  submission: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type DemoResponse = {
  ok?: boolean;
  seeded?: boolean;
  user?: string;
  defaultProject?: string;
  secondProject?: string;
  projects?: string[];
  analyses?: Analysis[];
  verify?: Record<string, string>;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  return body;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toISOString().replace("T", " ").replace(".000Z", "Z");
  } catch {
    return iso;
  }
}

function normalizeStatus(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isCompleted(status: string): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(status));
}

/** The readiness snapshot this run opens in the existing results component. */
function resolveSnapshotId(a: Analysis): string | null {
  const sid = a.submission?.snapshotId;
  if (typeof sid === "string" && UUID_RE.test(sid.trim())) return sid.trim();
  const fixture = a.submission?.fixture;
  if (typeof fixture === "string" && FIXTURE_SNAPSHOT_IDS[fixture]) {
    return FIXTURE_SNAPSHOT_IDS[fixture];
  }
  return null;
}

/** /readiness/snapshot?id=... — the same results route a fresh run lands on. */
function snapshotHref(id: string): string {
  return `/readiness/snapshot?id=${encodeURIComponent(id)}`;
}

function StatusPill({ status }: { status: string }) {
  const completed = isCompleted(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        completed ? "bg-green/15 text-green-dark" : "bg-amber/15 text-amber-dark"
      }`}
      data-status={completed ? "completed" : "in-flight"}
    >
      {status}
      {completed ? " · completed" : " · in-flight"}
    </span>
  );
}

type ProjectGroup = {
  project: string;
  rows: Analysis[];
  current: Analysis | null;
};

function OpenResultsLink({
  analysis,
  variant,
}: {
  analysis: Analysis;
  variant: "primary" | "link";
}) {
  const sid = resolveSnapshotId(analysis);
  if (!sid) {
    return <span className="text-xs text-muted">No snapshot</span>;
  }
  if (variant === "primary") {
    return (
      <a
        href={snapshotHref(sid)}
        className="btn inline-flex bg-purple text-white"
        data-testid="analysis-open-results"
        data-snapshot-id={sid}
      >
        Open results
      </a>
    );
  }
  return (
    <a
      href={snapshotHref(sid)}
      className="font-semibold text-purple underline hover:text-purple-dark"
      data-testid="analysis-history-open"
      data-snapshot-id={sid}
    >
      Open
    </a>
  );
}

function HistoryTable({ rows }: { rows: Analysis[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No analyses.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4 font-semibold">project</th>
            <th className="py-2 pr-4 font-semibold">status</th>
            <th className="py-2 pr-4 font-semibold">run timestamp</th>
            <th className="py-2 pr-4 font-semibold">results</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/60 align-top"
              data-testid="analysis-history-row"
              data-project={row.project}
            >
              <td className="py-2 pr-4 font-medium text-ink">{row.project}</td>
              <td className="py-2 pr-4">
                <StatusPill status={row.status} />
              </td>
              <td className="py-2 pr-4 font-mono text-xs">{fmtDate(row.created_at)}</td>
              <td className="py-2 pr-4">
                <OpenResultsLink analysis={row} variant="link" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectSection({ group }: { group: ProjectGroup }) {
  const { project, rows, current } = group;
  return (
    <section
      className="card"
      data-testid="analysis-project-group"
      data-project={project}
      aria-label={`${project} analysis history`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold" data-testid="analysis-project-label">
          {project}
        </h2>
        <span className="text-xs uppercase tracking-wide text-muted">{rows.length} run(s)</span>
      </div>

      {current ? (
        <div
          className="mt-4 rounded-xl border border-purple/30 bg-purple-soft/30 p-4"
          data-testid="analysis-current-result"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-dark">
            Current result
          </p>
          <p className="mt-1 text-sm text-muted">
            The most recent <strong>completed</strong> run of {project}. A newer non-completed run
            never shadows it; a completed re-run replaces it while older runs stay in history below.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill status={current.status} />
            <span className="font-mono text-xs text-muted">{fmtDate(current.created_at)}</span>
            <OpenResultsLink analysis={current} variant="primary" />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted" data-testid="analysis-no-current-result">
          No completed run yet for this project.
        </p>
      )}

      <div className="mt-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-muted">
          Run history
        </h3>
        <HistoryTable rows={rows} />
      </div>
    </section>
  );
}

export function AnalysesConsole() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Seed (idempotent) + read back the whole demo user history.
      const demoBody = await getJson<DemoResponse>("/api/analyses/demo");
      setDemo(demoBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analyses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<ProjectGroup[]>(() => {
    const analyses = demo?.analyses ?? [];
    const order = demo?.projects ?? [];
    const projects = order.length > 0 ? order : Array.from(new Set(analyses.map((a) => a.project)));
    return projects.map((project) => {
      const rows = analyses
        .filter((a) => a.project === project)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      // rows are newest-first, so the first completed row is the current result.
      const current = rows.find((r) => isCompleted(r.status)) ?? null;
      return { project, rows, current };
    });
  }, [demo]);

  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-4xl">
        <p className="eyebrow">Analysis history</p>
        <h1 className="mt-4 font-display text-4xl font-bold">Your analyses</h1>
        <p className="mt-4 text-muted">
          Every past readiness run, grouped by project. Within each project the most recent
          completed run is the current result; older runs stay listed and openable. Opening any
          completed run renders the same readiness report a fresh run produces. Shown for the demo
          user <code className="font-mono">{DEMO_USER}</code>; data is fetched same-origin from the
          public API.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {/*
            Non-destructive entry point for a fresh run: opens the readiness start
            flow at its project-label step (/readiness?new=1). A completed prior
            analysis never blocks starting a new one, and every run below stays
            accessible.
          */}
          <a
            href="/readiness?new=1"
            className="btn inline-flex bg-purple text-white"
            data-testid="analyses-new-analysis"
          >
            New analysis
          </a>
          <a
            href="/readiness"
            className="btn inline-flex border border-border"
            data-testid="analyses-readiness-link"
          >
            Readiness check
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="btn inline-flex border border-border"
          >
            Refresh
          </button>
        </div>

        {loading && <p className="mt-8 text-muted">Loading analyses…</p>}
        {error && (
          <div className="card mt-8 border-red">
            <p className="font-semibold text-red">Could not load analyses</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && demo && (
          <div className="mt-8 space-y-8" data-testid="analysis-history">
            {groups.length === 0 ? (
              <p className="text-sm text-muted">No analyses yet.</p>
            ) : (
              groups.map((group) => <ProjectSection key={group.project} group={group} />)
            )}
          </div>
        )}
      </div>
    </main>
  );
}
