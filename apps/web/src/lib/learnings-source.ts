/**
 * Build-time access to the Ratchet learnings log data store.
 *
 * The log lives at the repo root under data/ratchet-learnings.json and is read
 * from disk while the static export is generated — no runtime server code, no
 * new dependency (mirrors lib/guide-source.ts). Server components only: never
 * import from a client component.
 *
 * The write/validation module (@vygo/validation/learnings-log) touches
 * node:fs and node:path and must not reach the browser bundle; here we only
 * need read access for rendering, so we parse the JSON directly and keep the
 * public shape narrow.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const LOG_PATH = path.join(process.cwd(), "../../data/ratchet-learnings.json");

export type LearningStatus = "pending-in-guide" | "incorporated";

export type LearningEntry = {
  id: string;
  summary: string;
  /** Calendar date the improvement shipped (YYYY-MM-DD). */
  date: string;
  /** Source link: commit / PR / release-note anchor URL. */
  source_link: string;
  /** Guide section(s) the learning touches. */
  affected_sections: string[];
  status: LearningStatus;
  created: string;
  updated: string;
  /** Present only when status is "incorporated". */
  incorporated_date?: string;
};

export type LearningsLog = { entries: LearningEntry[] };

/** Read and parse the learnings log data store at build time. */
export function readLearningsLog(): LearningsLog {
  const parsed = JSON.parse(readFileSync(LOG_PATH, "utf8")) as LearningsLog;
  return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
}

/** Incorporated entries, newest incorporated first. */
export function incorporatedEntries(log: LearningsLog): LearningEntry[] {
  return log.entries.filter((entry) => entry.status === "incorporated");
}

/** Entries still pending incorporation into the guide. */
export function pendingEntries(log: LearningsLog): LearningEntry[] {
  return log.entries.filter((entry) => entry.status === "pending-in-guide");
}
