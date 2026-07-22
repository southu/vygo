/**
 * Build-time access to the guide revisions store.
 *
 * The store lives at the repo root under data/guide-revisions.json and is read
 * from disk while the static export is generated — no runtime server code, no
 * new dependency (mirrors lib/learnings-source.ts). Server components only:
 * never import from a client component.
 *
 * The write/validation module (@vygo/validation/guide-revisions) touches
 * node:fs and must not reach the browser bundle; here we only need read access
 * for rendering the revision history, so we parse the JSON directly.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const REVISIONS_PATH = path.join(process.cwd(), "../../data/guide-revisions.json");

export type RevisionLearning = {
  id: string;
  name: string;
  /** ISO YYYY-MM-DD date the learning was incorporated. */
  incorporated_date: string;
};

export type GuideRevision = {
  /** Stable revision id, e.g. "GR-2026-07-22-001". */
  id: string;
  /** ISO YYYY-MM-DD publish date. */
  date: string;
  title: string;
  summary: string;
  published_via: "git" | "manual";
  learnings: RevisionLearning[];
  created: string;
};

export type GuideRevisions = { revisions: GuideRevision[] };

/** Read and parse the guide revisions store at build time (empty if missing). */
export function readGuideRevisions(): GuideRevisions {
  let raw: string;
  try {
    raw = readFileSync(REVISIONS_PATH, "utf8");
  } catch {
    return { revisions: [] };
  }
  const parsed = JSON.parse(raw) as GuideRevisions;
  return { revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [] };
}

/** Revisions newest first (by publish date, then id). */
export function revisionsNewestFirst(store: GuideRevisions): GuideRevision[] {
  return [...store.revisions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}
