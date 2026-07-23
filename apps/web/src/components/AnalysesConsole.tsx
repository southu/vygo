"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import { EmailText } from "@/components/EmailText";

/**
 * Analysis history view.
 *
 * It renders every past analysis run GROUPED BY PROJECT — each entry showing its
 * project label, run timestamp, and status. Within each project the most recent
 * COMPLETED run is marked as that project's CURRENT result (an explicit marker
 * comes back from the API as per-row `current` + a `currentByProject` map; the
 * client only falls back to computing it when the API omits it). Older runs stay
 * listed and openable, and a newer non-completed run never shadows the current
 * result.
 *
 * Identity is scoped: the view always names the exact identity whose history it
 * shows (no cross-user listing). It supports two documented, seeded fixture
 * identities so the whole model is verifiable in a browser after a deploy:
 *   - the multi-run demo user (default), and
 *   - the legacy pre-migration single-analysis user (?fixture=legacy), whose one
 *     original result is retained and viewable after migration.
 * Any other `?user=<id>` is fetched scope-required from the public list API.
 *
 * Each completed entry links to the EXISTING analysis-detail/results component
 * (SnapshotView) at /readiness/snapshot?id=<snapshotId> — the same UI/route a
 * fresh run lands on. It never renders a parallel results view.
 */

const DEMO_USER = "demo@vygo.ai";
const LEGACY_USER = "legacy-single@vygo.ai";

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
  /** Explicit server marker: the latest completed run for its project. */
  current?: boolean;
};

type HistoryResponse = {
  ok?: boolean;
  seeded?: boolean;
  legacy?: boolean;
  user?: string;
  defaultProject?: string;
  secondProject?: string;
  projects?: string[];
  analyses?: Analysis[];
  /** project → id of that project's current (latest completed) run. */
  currentByProject?: Record<string, string>;
  verify?: Record<string, string>;
};

/** Which identity's history is on screen, and how it is fetched. */
type ViewSource = {
  user: string;
  label: string;
  /** Fixture identities seed-on-read via the demo op; scoped users use the list API. */
  via: "demo" | "scoped";
  legacy: boolean;
};

function resolveSource(search: string): ViewSource {
  const params = new URLSearchParams(search);
  const fixture = (params.get("fixture") || "").trim().toLowerCase();
  const rawUser = (params.get("user") || "").trim();
  const user = rawUser.toLowerCase();

  if (fixture === "legacy" || user === LEGACY_USER) {
    return { user: LEGACY_USER, label: "Legacy pre-migration user", via: "demo", legacy: true };
  }
  if (rawUser && user !== DEMO_USER) {
    return { user: rawUser, label: rawUser, via: "scoped", legacy: false };
  }
  return { user: DEMO_USER, label: "Demo user", via: "demo", legacy: false };
}

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

/** Visible "current run" badge, rendered on the latest completed run per project. */
function CurrentBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-purple px-2.5 py-0.5 text-xs font-semibold text-white"
      data-testid="analysis-current-badge"
      title="Latest completed run for this project"
    >
      ★ Current
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

function HistoryTable({ rows, currentId }: { rows: Analysis[]; currentId: string | null }) {
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
          {rows.map((row) => {
            const isCurrent = row.id === currentId;
            return (
              <tr
                key={row.id}
                className="border-b border-border/60 align-top"
                data-testid="analysis-history-row"
                data-project={row.project}
                data-current={isCurrent ? "true" : "false"}
              >
                <td className="py-2 pr-4 font-medium text-ink">{row.project}</td>
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={row.status} />
                    {isCurrent ? <CurrentBadge /> : null}
                  </div>
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{fmtDate(row.created_at)}</td>
                <td className="py-2 pr-4">
                  <OpenResultsLink analysis={row} variant="link" />
                </td>
              </tr>
            );
          })}
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
      data-current-run={current?.id ?? ""}
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
          data-current-run={current.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-dark">
              Current result
            </p>
            <CurrentBadge />
          </div>
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
        <HistoryTable rows={rows} currentId={current?.id ?? null} />
      </div>
    </section>
  );
}

export function AnalysesConsole() {
  const [source, setSource] = useState<ViewSource>({
    user: DEMO_USER,
    label: "Demo user",
    via: "demo",
    legacy: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);

  // Resolve the identity from the URL on mount (client-only; keeps this a plain
  // client component with no Suspense boundary).
  useEffect(() => {
    setSource(resolveSource(window.location.search));
  }, []);

  const load = useCallback(async (src: ViewSource) => {
    setLoading(true);
    setError(null);
    try {
      const path =
        src.via === "demo"
          ? `/api/analyses/demo?user=${encodeURIComponent(src.user)}`
          : `/api/analyses?user=${encodeURIComponent(src.user)}`;
      const body = await getJson<HistoryResponse>(path);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analyses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(source);
  }, [load, source]);

  const groups = useMemo<ProjectGroup[]>(() => {
    const analyses = data?.analyses ?? [];
    const currentByProject = data?.currentByProject ?? {};
    const order = data?.projects ?? [];
    const projects = order.length > 0 ? order : Array.from(new Set(analyses.map((a) => a.project)));
    return projects.map((project) => {
      const rows = analyses
        .filter((a) => a.project === project)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      // Prefer the explicit server marker; fall back to first completed row.
      const currentId = currentByProject[project];
      const current = currentId
        ? (rows.find((r) => r.id === currentId) ?? null)
        : (rows.find((r) => r.current) ?? rows.find((r) => isCompleted(r.status)) ?? null);
      return { project, rows, current };
    });
  }, [data]);

  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-4xl">
        <p className="eyebrow">Analysis history</p>
        <h1 className="mt-4 font-display text-4xl font-bold">Your analyses</h1>
        <p className="mt-4 text-muted">
          Every past readiness run, grouped by project. Within each project the most recent
          completed run is marked <strong>current</strong>; older runs stay listed and openable.
          Opening any completed run renders the same readiness report a fresh run produces. History
          is scoped to a single identity — no cross-user listing — shown here for{" "}
          <code className="font-mono" data-testid="analysis-view-user">
            <EmailText address={source.user} />
          </code>{" "}
          (<span data-testid="analysis-view-label">{source.label}</span>).
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
          {source.legacy || source.via === "scoped" ? (
            <a
              href="/analyses"
              className="btn inline-flex border border-border"
              data-testid="analyses-demo-link"
            >
              Demo user history
            </a>
          ) : (
            <a
              href="/analyses?fixture=legacy"
              className="btn inline-flex border border-border"
              data-testid="analyses-legacy-link"
            >
              Legacy pre-migration user
            </a>
          )}
          <button
            type="button"
            onClick={() => void load(source)}
            className="btn inline-flex border border-border"
          >
            Refresh
          </button>
        </div>

        {source.legacy && (
          <div
            className="card mt-6 border-purple/30 bg-purple-soft/20"
            data-testid="analysis-legacy-note"
          >
            <p className="text-sm text-muted">
              This identity had a <strong>single analysis</strong> before the multi-run migration.
              Its one original result was re-homed into{" "}
              <code className="font-mono">Default project</code> and is still present and viewable
              after this deploy — shown below as the current result of that project.
            </p>
          </div>
        )}

        {loading && <p className="mt-8 text-muted">Loading analyses…</p>}
        {error && (
          <div className="card mt-8 border-red">
            <p className="font-semibold text-red">Could not load analyses</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
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
