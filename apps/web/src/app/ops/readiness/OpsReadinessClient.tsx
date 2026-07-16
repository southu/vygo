"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearOpsCredentials,
  loadOpsAuthHeader,
  opsApiUrl,
  saveOpsCredentials,
} from "@/lib/ops-auth";

type ListRow = {
  id: string;
  bucket: string | null;
  createdAt: string;
  contactName: string | null;
  contactEmail: string | null;
  company: string | null;
  overallScore: number | null;
  discrepancyFlagCount: number;
  hasBrief: boolean;
};

type ListResponse = {
  items: ListRow[];
  count: number;
  filters: { bucket: string | null; from: string | null; to: string | null };
};

type DetailResponse = {
  id: string;
  bucket: string | null;
  createdAt: string;
  scores: Record<string, unknown> | null;
  discrepancyFlags: unknown[];
  contact: Record<string, unknown> | null;
  parsedReport: Record<string, unknown> | null;
  rawPasteRedacted: string | null;
  brief: {
    id: string;
    submissionId: string;
    talkingPoints: string[];
    scoreSummary: Record<string, unknown> | null;
    bucket: string | null;
    discrepancyFlags: unknown[];
    llmPolished: boolean;
    body: Record<string, unknown>;
    createdAt: string;
  } | null;
};

function dayInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function OpsReadinessClient() {
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [user, setUser] = useState("ops");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [bucket, setBucket] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [items, setItems] = useState<ListRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    setAuthHeader(loadOpsAuthHeader());
  }, []);

  const filters = useMemo(
    () => ({
      bucket: bucket.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    }),
    [bucket, from, to],
  );

  const loadList = useCallback(
    async (header: string) => {
      setLoading(true);
      setListError(null);
      try {
        const url = opsApiUrl("/v1/ops/readiness", filters);
        const res = await fetch(url, {
          headers: { accept: "application/json", authorization: header },
          cache: "no-store",
        });
        if (res.status === 401) {
          clearOpsCredentials();
          setAuthHeader(null);
          setAuthError("Authentication required. Enter ops credentials.");
          setItems([]);
          return;
        }
        if (!res.ok) {
          setListError(`List failed (HTTP ${res.status}).`);
          setItems([]);
          return;
        }
        const body = (await res.json()) as ListResponse;
        setItems(Array.isArray(body.items) ? body.items : []);
      } catch {
        setListError("Could not load readiness list.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    if (!authHeader) return;
    void loadList(authHeader);
  }, [authHeader, loadList]);

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    saveOpsCredentials(user.trim() || "ops", password);
    const header = loadOpsAuthHeader();
    setAuthHeader(header);
    setPassword("");
  };

  const onLogout = () => {
    clearOpsCredentials();
    setAuthHeader(null);
    setItems([]);
    setDetail(null);
    setSelectedId(null);
  };

  const openDetail = async (id: string) => {
    if (!authHeader) return;
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    try {
      const res = await fetch(opsApiUrl(`/v1/ops/readiness/${encodeURIComponent(id)}`), {
        headers: { accept: "application/json", authorization: authHeader },
        cache: "no-store",
      });
      if (res.status === 401) {
        clearOpsCredentials();
        setAuthHeader(null);
        setAuthError("Session expired. Sign in again.");
        return;
      }
      if (!res.ok) {
        setDetailError(`Could not load brief (HTTP ${res.status}).`);
        return;
      }
      setDetail((await res.json()) as DetailResponse);
    } catch {
      setDetailError("Could not load submission brief.");
    }
  };

  const exportCsv = async () => {
    if (!authHeader) return;
    try {
      const url = opsApiUrl("/v1/ops/readiness/export", filters);
      const res = await fetch(url, {
        headers: { accept: "text/csv", authorization: authHeader },
        cache: "no-store",
      });
      if (res.status === 401) {
        clearOpsCredentials();
        setAuthHeader(null);
        setAuthError("Session expired. Sign in again.");
        return;
      }
      if (!res.ok) {
        setListError(`CSV export failed (HTTP ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "vygo-readiness-submissions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setListError("CSV export failed.");
    }
  };

  if (!authHeader) {
    return (
      <section className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">Ops sign-in</h1>
        <p className="mt-2 text-sm text-muted">
          Internal readiness list. Credentials come from the ops environment (
          <code className="text-xs">OPS_BASIC_AUTH_*</code>).
        </p>
        <form onSubmit={onLogin} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-ink">
            Username
            <input
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {authError ? <p className="text-sm text-red-700">{authError}</p> : null}
          <button type="submit" className="btn btn-primary w-full">
            Sign in
          </button>
        </form>
      </section>
    );
  }

  const scoreSummary = detail?.brief?.scoreSummary ?? detail?.scores;
  const dims =
    scoreSummary &&
    typeof scoreSummary === "object" &&
    scoreSummary.dimensions &&
    typeof scoreSummary.dimensions === "object"
      ? (scoreSummary.dimensions as Record<string, unknown>)
      : null;
  const flags = detail?.brief?.discrepancyFlags ?? detail?.discrepancyFlags ?? [];
  const parsed =
    detail?.parsedReport ??
    (detail?.brief?.body?.parsedTechReport &&
    typeof detail.brief.body.parsedTechReport === "object"
      ? (detail.brief.body.parsedTechReport as Record<string, unknown>)
      : null);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Internal ops</p>
          <h1 className="font-display text-3xl font-semibold text-ink">Readiness submissions</h1>
          <p className="mt-1 text-sm text-muted">
            Read-only list. Path: <code className="text-xs">/ops/readiness</code>
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          Sign out
        </button>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (authHeader) void loadList(authHeader);
          }}
        >
          <label className="text-sm font-medium text-ink">
            Bucket
            <input
              className="mt-1 block w-40 rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="e.g. Launch"
              list="ops-bucket-suggestions"
            />
            <datalist id="ops-bucket-suggestions">
              <option value="Launch" />
              <option value="Enterprise" />
              <option value="Not a fit" />
              <option value="Scale" />
            </datalist>
          </label>
          <label className="text-sm font-medium text-ink">
            From
            <input
              type="date"
              className="mt-1 block rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            To
            <input
              type="date"
              className="mt-1 block rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Apply filters
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void exportCsv()}>
            Export CSV
          </button>
        </form>
        {listError ? <p className="mt-3 text-sm text-red-700">{listError}</p> : null}
        <p className="mt-3 text-xs text-muted">
          {loading ? "Loading…" : `${items.length} row(s)`}
          {from || to || bucket
            ? ` · filters: bucket=${bucket || "—"} from=${from || "—"} to=${to || "—"}`
            : null}
        </p>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-canvas text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Bucket</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Flags</th>
              <th className="px-4 py-3 font-semibold">Brief</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No submissions match the current filters.
                </td>
              </tr>
            ) : null}
            {items.map((row) => (
              <tr
                key={row.id}
                className={`cursor-pointer border-b border-border/70 hover:bg-canvas/80 ${
                  selectedId === row.id ? "bg-purple-soft/40" : ""
                }`}
                onClick={() => void openDetail(row.id)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {dayInputValue(row.createdAt)}{" "}
                  <span className="text-xs text-muted">{row.createdAt.slice(11, 19)}Z</span>
                </td>
                <td className="px-4 py-3 font-medium">{row.bucket ?? "—"}</td>
                <td className="px-4 py-3">{row.company ?? "—"}</td>
                <td className="px-4 py-3">
                  <div>{row.contactName ?? "—"}</div>
                  <div className="text-xs text-muted">{row.contactEmail ?? ""}</div>
                </td>
                <td className="px-4 py-3">{row.overallScore ?? "—"}</td>
                <td className="px-4 py-3">{row.discrepancyFlagCount}</td>
                <td className="px-4 py-3">{row.hasBrief ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedId ? (
        <section
          id="ops-brief"
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
          data-submission-id={selectedId}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Internal brief</h2>
              <p className="mt-1 font-mono text-xs text-muted">{selectedId}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
              }}
            >
              Close
            </button>
          </div>
          {detailError ? <p className="mt-4 text-sm text-red-700">{detailError}</p> : null}
          {!detail && !detailError ? (
            <p className="mt-4 text-sm text-muted">Loading brief…</p>
          ) : null}
          {detail ? (
            <div className="mt-6 space-y-6 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase text-muted">Bucket</div>
                  <div className="mt-1 font-medium" data-field="bucket">
                    {detail.brief?.bucket ?? detail.bucket ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted">Created</div>
                  <div className="mt-1">{detail.createdAt}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase text-muted">Scores</div>
                <div className="mt-2 rounded-xl border border-border bg-canvas p-3" data-field="scores">
                  {dims ? (
                    <ul className="space-y-1">
                      {Object.entries(dims).map(([k, v]) => (
                        <li key={k}>
                          <strong>{k}:</strong> {String(v)}
                        </li>
                      ))}
                      {"overall" in (scoreSummary || {}) ? (
                        <li>
                          <strong>overall:</strong> {String((scoreSummary as Record<string, unknown>).overall)}
                        </li>
                      ) : null}
                    </ul>
                  ) : scoreSummary ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(scoreSummary, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted">No scores</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase text-muted">Discrepancy flags</div>
                <div
                  className="mt-2 rounded-xl border border-border bg-canvas p-3"
                  data-field="discrepancy-flags"
                >
                  {Array.isArray(flags) && flags.length > 0 ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(flags, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase text-muted">Parsed report</div>
                <div
                  className="mt-2 max-h-96 overflow-auto rounded-xl border border-border bg-canvas p-3"
                  data-field="parsed-report"
                >
                  {parsed ? (
                    <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(parsed, null, 2)}</pre>
                  ) : (
                    <span className="text-muted">No parsed report</span>
                  )}
                </div>
              </div>

              {detail.brief?.talkingPoints?.length ? (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted">Talking points</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {detail.brief.talkingPoints.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {detail.rawPasteRedacted ? (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted">
                    Raw paste (redacted)
                  </div>
                  <pre
                    className="mt-2 max-h-48 overflow-auto rounded-xl border border-border bg-canvas p-3 text-xs"
                    data-field="raw-paste-redacted"
                  >
                    {detail.rawPasteRedacted}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
