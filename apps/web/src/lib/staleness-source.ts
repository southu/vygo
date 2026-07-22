/**
 * Build-time access to the Ratchet staleness signal for server components.
 *
 * Reads BOTH limits from the single cadence config file
 * (config/learnings-cadence.json — the sole source of truth) and the pending
 * count + last-refresh timestamp from the canonical learnings log, then computes
 * the status with the shared, pure {@link computeStaleness} module. The
 * guide-progress badge renders this into static page source; GET /api/staleness
 * is generated from the same inputs (scripts/generate-staleness.ts), so the
 * badge's data-stale attribute always matches the endpoint. Server components
 * only: never import from a client component.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeStaleness, resolveLastRefresh, type StalenessStatus } from "@vygo/validation";
import { pendingEntries, readLearningsLog } from "./learnings-source";

/** The single cadence config file, resolved from apps/web at build time. */
const CADENCE_PATH = path.join(process.cwd(), "../../config/learnings-cadence.json");

interface CadenceConfig {
  staleness_threshold: number;
  refresh_window_days: number;
}

/** Read and validate the single cadence config file. */
function readCadence(): CadenceConfig {
  const parsed = JSON.parse(readFileSync(CADENCE_PATH, "utf8")) as Partial<CadenceConfig>;
  if (
    typeof parsed.staleness_threshold !== "number" ||
    typeof parsed.refresh_window_days !== "number"
  ) {
    throw new Error(`invalid cadence config at ${CADENCE_PATH}`);
  }
  return {
    staleness_threshold: parsed.staleness_threshold,
    refresh_window_days: parsed.refresh_window_days,
  };
}

/** Compute the current staleness status at build time. */
export function readStalenessStatus(): StalenessStatus {
  const cadence = readCadence();
  const log = readLearningsLog();
  return computeStaleness({
    pendingCount: pendingEntries(log).length,
    threshold: cadence.staleness_threshold,
    lastRefresh: resolveLastRefresh(log.entries),
    windowDays: cadence.refresh_window_days,
  });
}
