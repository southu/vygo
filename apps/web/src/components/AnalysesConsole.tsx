"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

/**
 * Browser-only verification console for the analysis-history data model.
 *
 * On load it hits the idempotent, non-destructive demo fixture
 * (GET /api/analyses/demo), which seeds a fixed demo user (demo@vygo.ai) the
 * first time and returns the current state thereafter. It then renders — for a
 * human or an automated browser tester — the migrated 'Default project'
 * history, the distinct second project, and the default result retrieval
 * (latest COMPLETED per project), all fetched same-origin from the live API.
 *
 * No secrets, no auth: the fixture is a documented demo namespace only. Real
 * users' data is never touched.
 */

const DEMO_USER = "demo@vygo.ai";

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

type ResultResponse = {
  ok?: boolean;
  project?: string;
  analysis?: Analysis;
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

function StatusPill({ status }: { status: string }) {
  const completed =
    !/^(pending|processing|queued|running|failed|failure|error|errored|cancelled|canceled|aborted|rejected|expired|draft|new|incomplete)$/i.test(
      status.trim(),
    );
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        completed ? "bg-green/15 text-green-dark" : "bg-amber/15 text-amber-dark"
      }`}
    >
      {status}
      {completed ? " · completed" : " · in-flight"}
    </span>
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
            <th className="py-2 pr-4 font-semibold">#</th>
            <th className="py-2 pr-4 font-semibold">status</th>
            <th className="py-2 pr-4 font-semibold">created_at</th>
            <th className="py-2 pr-4 font-semibold">id</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className="border-b border-border/60 align-top">
              <td className="py-2 pr-4 text-muted">{i + 1}</td>
              <td className="py-2 pr-4">
                <StatusPill status={row.status} />
              </td>
              <td className="py-2 pr-4 font-mono text-xs">{fmtDate(row.created_at)}</td>
              <td className="py-2 pr-4 font-mono text-xs text-muted">{row.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysesConsole() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoResponse | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Seed (idempotent) + read back the whole demo user history.
      const demoBody = await getJson<DemoResponse>("/api/analyses/demo");
      setDemo(demoBody);
      // Default result retrieval for the legacy 'Default project'.
      const resultBody = await getJson<ResultResponse>(
        `/api/analyses/result?user=${encodeURIComponent(DEMO_USER)}`,
      );
      setResult(resultBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analyses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const analyses = demo?.analyses ?? [];
  const defaultProject = demo?.defaultProject ?? "Default project";
  const secondProject = demo?.secondProject ?? "Project Beta";
  const byProject = (project: string) =>
    analyses
      .filter((a) => a.project === project)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const projects = demo?.projects ?? [];
  const resultAnalysis = result?.analysis ?? null;

  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-4xl">
        <p className="eyebrow">Analysis history</p>
        <h1 className="mt-4 font-display text-4xl font-bold">Analyses dashboard</h1>
        <p className="mt-4 text-muted">
          Live, browser-verifiable view of the analysis-history model for the demo user{" "}
          <code className="font-mono">{DEMO_USER}</code>. Data is fetched same-origin from the
          public API. The demo fixture is idempotent and non-destructive.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {/*
            Results-page entry point for a fresh run. Non-destructive: every
            prior analysis below stays accessible; this opens the readiness start
            flow at its project-label step (/readiness?new=1) so the user
            picks/enters a project before the new run begins. A completed prior
            analysis never blocks starting a new one.
          */}
          <a
            href="/readiness?new=1"
            className="btn inline-flex bg-purple text-white"
            data-testid="analyses-new-analysis"
          >
            New analysis
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="btn inline-flex border border-border"
          >
            Refresh
          </button>
          <a href="/api/analyses/demo" className="btn inline-flex border border-border">
            View demo JSON
          </a>
        </div>

        {loading && <p className="mt-8 text-muted">Loading analyses…</p>}
        {error && (
          <div className="card mt-8 border-red">
            <p className="font-semibold text-red">Could not load analyses</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && demo && (
          <div className="mt-8 space-y-8">
            <section className="card">
              <h2 className="font-display text-xl font-semibold">Default result retrieval</h2>
              <p className="mt-2 text-sm text-muted">
                <code className="font-mono">GET /api/analyses/result?user={DEMO_USER}</code> — the
                latest <strong>completed</strong> analysis of{" "}
                <code className="font-mono">{defaultProject}</code>. A newer non-completed run never
                shadows it.
              </p>
              {resultAnalysis ? (
                <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">status</dt>
                    <dd>
                      <StatusPill status={resultAnalysis.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">created_at</dt>
                    <dd className="font-mono text-xs">{fmtDate(resultAnalysis.created_at)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted">
                      submission (preserved byte-for-byte)
                    </dt>
                    <dd>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-muted-surface p-3 font-mono text-xs">
                        {JSON.stringify(resultAnalysis.submission, null, 2)}
                      </pre>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-muted">No completed result yet.</p>
              )}
            </section>

            <section className="card">
              <h2 className="font-display text-xl font-semibold">
                {defaultProject} — history ({byProject(defaultProject).length})
              </h2>
              <p className="mt-2 text-sm text-muted">
                Oldest first. Entry #1 is the migrated legacy single analysis; later entries do not
                overwrite it.
              </p>
              <div className="mt-4">
                <HistoryTable rows={byProject(defaultProject)} />
              </div>
            </section>

            <section className="card">
              <h2 className="font-display text-xl font-semibold">
                {secondProject} — history ({byProject(secondProject).length})
              </h2>
              <p className="mt-2 text-sm text-muted">
                A distinct second project for the same user, listed separately.
              </p>
              <div className="mt-4">
                <HistoryTable rows={byProject(secondProject)} />
              </div>
            </section>

            <section className="card">
              <h2 className="font-display text-xl font-semibold">Verify via the API</h2>
              <p className="mt-2 text-sm text-muted">
                Projects for this user: {projects.map((p) => `"${p}"`).join(", ") || "none"}.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(demo.verify ?? {}).map(([label, path]) => (
                  <li key={label}>
                    <span className="font-semibold">{label}:</span>{" "}
                    <a className="font-mono text-xs text-purple underline" href={path}>
                      {path}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
