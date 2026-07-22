import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEntry,
  assertAdditive,
  countPending,
  DEFAULT_CADENCE_CONFIG_PATH,
  DEFAULT_LEARNINGS_LOG_PATH,
  isGuideRefreshDue,
  learningsLogSchema,
  LearningsLogError,
  markIncorporated,
  readCadenceConfig,
  readLog,
  writeLog,
  type LearningEntry,
} from "./learnings-log.js";

const SAMPLE = {
  id: "L-001",
  summary: "Security-first engagements need an explicit RLS callout.",
  date: "2026-07-22",
  source_link: "https://github.com/southu/vygo/commit/deadbeef",
  affected_sections: ["method", "pricing"],
};

describe("learnings-log module", () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "learnings-"));
    logPath = join(dir, "ratchet-learnings.json");
    writeFileSync(logPath, `${JSON.stringify({ entries: [] }, null, 2)}\n`, "utf8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("read/write round-trips an appended entry", () => {
    const created = appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T10:00:00.000Z" });
    assert.equal(created.status, "pending-in-guide");
    assert.equal(created.created, "2026-07-22T10:00:00.000Z");
    assert.equal(created.updated, "2026-07-22T10:00:00.000Z");
    assert.equal(created.incorporated_date, undefined);

    const log = readLog(logPath);
    assert.equal(log.entries.length, 1);
    const [first] = log.entries;
    assert.ok(first);
    assert.deepEqual(first, created);
    assert.deepEqual(first.affected_sections, ["method", "pricing"]);
  });

  it("appends multiple entries additively and rejects duplicate ids", () => {
    appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T10:00:00.000Z" });
    appendEntry(
      { ...SAMPLE, id: "L-002", summary: "Second learning." },
      { path: logPath, now: "2026-07-22T11:00:00.000Z" },
    );
    assert.equal(readLog(logPath).entries.length, 2);
    assert.throws(
      () => appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T12:00:00.000Z" }),
      LearningsLogError,
    );
  });

  it("transitions pending-in-guide -> incorporated and stamps incorporated_date", () => {
    appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T10:00:00.000Z" });

    const incorporated = markIncorporated("L-001", {
      path: logPath,
      now: "2026-07-25T09:30:00.000Z",
    });
    assert.equal(incorporated.status, "incorporated");
    assert.equal(incorporated.incorporated_date, "2026-07-25T09:30:00.000Z");
    assert.equal(incorporated.updated, "2026-07-25T09:30:00.000Z");
    // Immutable fields survive the transition untouched.
    assert.equal(incorporated.created, "2026-07-22T10:00:00.000Z");
    assert.equal(incorporated.summary, SAMPLE.summary);

    const reread = readLog(logPath);
    const [entry] = reread.entries;
    assert.ok(entry);
    assert.equal(entry.status, "incorporated");
    assert.equal(entry.incorporated_date, "2026-07-25T09:30:00.000Z");

    // Marking again is idempotent and preserves the original incorporated_date.
    const again = markIncorporated("L-001", { path: logPath, now: "2026-08-01T00:00:00.000Z" });
    assert.equal(again.incorporated_date, "2026-07-25T09:30:00.000Z");
  });

  it("rejects deleting an entry", () => {
    appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T10:00:00.000Z" });
    assert.throws(
      () => writeLog({ entries: [] }, { path: logPath }),
      (err: unknown) => {
        assert.ok(err instanceof LearningsLogError);
        assert.match(err.message, /deleted/);
        return true;
      },
    );
    // Store is unchanged after the rejected write.
    assert.equal(readLog(logPath).entries.length, 1);
  });

  it("rejects mutation of immutable fields", () => {
    appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T10:00:00.000Z" });
    const log = readLog(logPath);
    const [entry] = log.entries;
    assert.ok(entry);
    const tampered = { entries: [{ ...entry, summary: "rewritten summary" }] };
    assert.throws(
      () => writeLog(tampered, { path: logPath }),
      (err: unknown) => {
        assert.ok(err instanceof LearningsLogError);
        assert.match(err.message, /immutable field "summary"/);
        return true;
      },
    );
    assert.equal(readLog(logPath).entries[0]?.summary, SAMPLE.summary);
  });

  it("rejects an incorporated -> pending status regression", () => {
    appendEntry(SAMPLE, { path: logPath, now: "2026-07-22T10:00:00.000Z" });
    markIncorporated("L-001", { path: logPath, now: "2026-07-25T09:30:00.000Z" });

    const log = readLog(logPath);
    const [entry] = log.entries;
    assert.ok(entry);
    // Strip incorporated_date so the regression (not a stamp mismatch) is what trips.
    const { incorporated_date: _drop, ...rest } = entry;
    const reverted = {
      entries: [{ ...rest, status: "pending-in-guide" } as LearningEntry],
    };
    assert.throws(
      () => writeLog(reverted, { path: logPath }),
      (err: unknown) => {
        assert.ok(err instanceof LearningsLogError);
        assert.match(err.message, /reverted from incorporated/);
        return true;
      },
    );
    assert.equal(readLog(logPath).entries[0]?.status, "incorporated");
  });

  it("assertAdditive permits appending brand-new entries", () => {
    const previous = { entries: [] };
    const next = {
      entries: [
        {
          ...SAMPLE,
          status: "pending-in-guide",
          created: "2026-07-22T10:00:00.000Z",
          updated: "2026-07-22T10:00:00.000Z",
        } as LearningEntry,
      ],
    };
    assert.doesNotThrow(() => assertAdditive(previous, next));
  });
});

describe("cadence config + committed seed", () => {
  it("reads staleness threshold N and refresh window M from the single config file", () => {
    const cadence = readCadenceConfig(DEFAULT_CADENCE_CONFIG_PATH);
    assert.equal(typeof cadence.staleness_threshold, "number");
    assert.ok(cadence.staleness_threshold > 0);
    assert.equal(typeof cadence.refresh_window_days, "number");
    assert.ok(cadence.refresh_window_days > 0);
  });

  it("the committed seed log is valid and additive-consistent", () => {
    const seed = readLog(DEFAULT_LEARNINGS_LOG_PATH);
    assert.ok(learningsLogSchema.safeParse(seed).success);
    assert.ok(seed.entries.length > 0, "seed should carry the guide-refresh learnings");

    // Ids are unique.
    const ids = new Set(seed.entries.map((entry) => entry.id));
    assert.equal(ids.size, seed.entries.length);

    // Incorporated entries carry an incorporated_date and a source link; pending
    // entries carry a reason and no incorporated_date.
    for (const entry of seed.entries) {
      assert.ok(entry.source_link.length > 0);
      if (entry.status === "incorporated") {
        assert.ok(entry.incorporated_date, `${entry.id} should have incorporated_date`);
      } else {
        assert.equal(entry.incorporated_date, undefined);
        assert.match(entry.summary, /pending:/i, `${entry.id} should state a reason`);
      }
    }

    // Pending count must stay below the staleness threshold so a refresh isn't
    // spuriously flagged as due right after seeding.
    assert.ok(
      countPending(seed) < readCadenceConfig(DEFAULT_CADENCE_CONFIG_PATH).staleness_threshold,
    );
    assert.equal(isGuideRefreshDue(), false);
  });
});
