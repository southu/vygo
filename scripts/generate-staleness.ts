/**
 * Generates apps/web/public/api/staleness.json for GET /api/staleness.
 *
 * Invoked by CI and by apps/web prebuild (mirrors generate-readiness.ts). Reads
 * BOTH limits from the single cadence config file (config/learnings-cadence.json)
 * and the pending count + last-refresh timestamp from the canonical learnings log
 * (data/ratchet-learnings.json), then writes the machine-readable staleness
 * status. The static export serves this file at /api/staleness via a vercel.json
 * rewrite, so the endpoint and the on-page badge are computed from one source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countPending,
  readCadenceConfig,
  readLog,
} from "../packages/validation/src/learnings-log.js";
import { computeStaleness, resolveLastRefresh } from "../packages/validation/src/staleness.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const OUT_PATH = path.resolve(REPO_ROOT, "apps", "web", "public", "api", "staleness.json");

function main(): void {
  const cadence = readCadenceConfig();
  const log = readLog();

  const status = computeStaleness({
    pendingCount: countPending(log),
    threshold: cadence.staleness_threshold,
    lastRefresh: resolveLastRefresh(log.entries),
    windowDays: cadence.refresh_window_days,
  });

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  console.log(
    `[generate-staleness] stale=${status.stale} reasons=[${status.reasons.join(", ")}] ` +
      `pending=${status.pending_count}/${status.threshold} window=${status.window} -> ${OUT_PATH}`,
  );
}

main();
