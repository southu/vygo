import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEntry, readLog, markIncorporated } from "./learnings-log.js";
import { readGuideRevisions } from "./guide-revisions.js";
import {
  assertNoCredentialMaterial,
  buildDraft,
  GuideUpdateError,
  publishDraft,
  selectPending,
} from "./guide-update.js";

describe("guide-update workflow", () => {
  let dir: string;
  let logPath: string;
  let revisionsPath: string;

  const NOW = "2026-07-22T10:00:00.000Z";
  const DATE = "2026-07-22";

  function seedLearning(id: string, extra: Record<string, unknown> = {}) {
    appendEntry(
      {
        id,
        summary: `Summary for ${id}. Pending: needs review.`,
        title: `Name of ${id}`,
        date: "2026-07-20",
        source_link: `https://github.com/southu/ratchet/commit/${id}`,
        affected_sections: ["core-workflow"],
        ...extra,
      },
      { path: logPath, now: NOW },
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "guide-update-"));
    logPath = join(dir, "ratchet-learnings.json");
    revisionsPath = join(dir, "guide-revisions.json");
    writeFileSync(logPath, `${JSON.stringify({ entries: [] }, null, 2)}\n`, "utf8");
    writeFileSync(revisionsPath, `${JSON.stringify({ revisions: [] }, null, 2)}\n`, "utf8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("SELECT rejects unknown, already-incorporated, empty, and duplicate selections", () => {
    seedLearning("L-a");
    assert.throws(() => selectPending([], { logPath }), GuideUpdateError);
    assert.throws(() => selectPending(["L-nope"], { logPath }), GuideUpdateError);
    assert.throws(() => selectPending(["L-a", "L-a"], { logPath }), GuideUpdateError);
    markIncorporated("L-a", { path: logPath, now: NOW, incorporatedDate: DATE });
    assert.throws(() => selectPending(["L-a"], { logPath }), GuideUpdateError);
  });

  it("DRAFT flips pending-in-guide -> draft and holds a revision without publishing", () => {
    seedLearning("L-a");
    seedLearning("L-b");

    const draft = buildDraft(
      {
        learningIds: ["L-a", "L-b"],
        date: DATE,
        title: "Fold in two learnings",
        summary: "Two learnings incorporated.",
        now: NOW,
      },
      { logPath, revisionsPath },
    );

    // Revision id assigned, both learnings named.
    assert.equal(draft.id, "GR-2026-07-22-001");
    assert.equal(draft.status, "draft");
    assert.deepEqual(
      draft.learnings.map((l) => l.id),
      ["L-a", "L-b"],
    );
    assert.equal(draft.learnings[0]?.name, "Name of L-a");
    // Changelog copy ties each learning to the revision id.
    assert.match(draft.changelog_markdown, /GR-2026-07-22-001/);
    assert.match(draft.changelog_markdown, /Name of L-a/);
    assert.match(draft.changelog_markdown, /L-b/);

    // Log entries moved to draft; NOTHING published to the revisions store.
    const log = readLog(logPath);
    assert.equal(log.entries.find((e) => e.id === "L-a")?.status, "draft");
    assert.equal(log.entries.find((e) => e.id === "L-b")?.status, "draft");
    assert.equal(readGuideRevisions(revisionsPath).revisions.length, 0);
  });

  it("PUBLISH incorporates the learnings, stamps the date, and records the revision", () => {
    seedLearning("L-a");
    const draft = buildDraft(
      {
        learningIds: ["L-a"],
        date: DATE,
        title: "Incorporate L-a",
        summary: "One learning.",
        now: NOW,
      },
      { logPath, revisionsPath },
    );

    const { revision, incorporated } = publishDraft(draft, {
      logPath,
      revisionsPath,
      publishedVia: "git",
      now: "2026-07-22T12:00:00.000Z",
    });

    // BOOKKEEPING: learning flips to incorporated with a YYYY-MM-DD stamp.
    assert.equal(incorporated[0]?.status, "incorporated");
    assert.equal(incorporated[0]?.incorporated_date, DATE);
    const reread = readLog(logPath).entries.find((e) => e.id === "L-a");
    assert.equal(reread?.status, "incorporated");
    assert.equal(reread?.incorporated_date, DATE);

    // Revision recorded with the id, publish channel, and named learning.
    assert.equal(revision.id, "GR-2026-07-22-001");
    assert.equal(revision.published_via, "git");
    assert.equal(revision.learnings.length, 1);
    assert.equal(revision.learnings[0]?.id, "L-a");
    assert.equal(revision.learnings[0]?.name, "Name of L-a");
    assert.equal(revision.learnings[0]?.incorporated_date, DATE);

    const store = readGuideRevisions(revisionsPath);
    assert.equal(store.revisions.length, 1);
    assert.equal(store.revisions[0]?.id, "GR-2026-07-22-001");
  });

  it("full lifecycle: pending-in-guide -> draft -> incorporated for the same entry", () => {
    seedLearning("L-x");
    assert.equal(readLog(logPath).entries[0]?.status, "pending-in-guide");

    const draft = buildDraft(
      { learningIds: ["L-x"], date: DATE, title: "t", summary: "s", now: NOW },
      { logPath, revisionsPath },
    );
    assert.equal(readLog(logPath).entries[0]?.status, "draft");

    publishDraft(draft, { logPath, revisionsPath, now: NOW });
    assert.equal(readLog(logPath).entries[0]?.status, "incorporated");
  });

  it("assigns distinct revision ids across successive publishes", () => {
    seedLearning("L-1");
    seedLearning("L-2");
    const d1 = buildDraft(
      { learningIds: ["L-1"], date: DATE, title: "t1", summary: "s1", now: NOW },
      { logPath, revisionsPath },
    );
    publishDraft(d1, { logPath, revisionsPath, now: NOW });
    const d2 = buildDraft(
      { learningIds: ["L-2"], date: "2026-07-23", title: "t2", summary: "s2", now: NOW },
      { logPath, revisionsPath },
    );
    assert.equal(d1.id, "GR-2026-07-22-001");
    assert.equal(d2.id, "GR-2026-07-23-002");
    publishDraft(d2, { logPath, revisionsPath, now: NOW });
    assert.equal(readGuideRevisions(revisionsPath).revisions.length, 2);
  });

  it("record-publish (manual) records a manual revision without git", () => {
    seedLearning("L-m");
    const draft = buildDraft(
      { learningIds: ["L-m"], date: DATE, title: "t", summary: "s", now: NOW },
      { logPath, revisionsPath },
    );
    const { revision } = publishDraft(draft, {
      logPath,
      revisionsPath,
      publishedVia: "manual",
      now: NOW,
    });
    assert.equal(revision.published_via, "manual");
  });

  it("refuses a date that is not ISO YYYY-MM-DD", () => {
    seedLearning("L-a");
    assert.throws(
      () =>
        buildDraft(
          { learningIds: ["L-a"], date: "07/22/2026", title: "t", summary: "s", now: NOW },
          { logPath, revisionsPath },
        ),
      GuideUpdateError,
    );
  });

  it("scrubs credential material from generated content", () => {
    assert.throws(
      () => assertNoCredentialMaterial("here is a RAILWAY_TOKEN", "test"),
      GuideUpdateError,
    );
    assert.throws(
      () => assertNoCredentialMaterial("Authorization: Bearer abcdef123456", "test"),
      GuideUpdateError,
    );
    assert.doesNotThrow(() => assertNoCredentialMaterial("a clean summary", "test"));

    // A learning whose summary carries a token is rejected before it can be drafted.
    seedLearning("L-bad", { summary: "leaky note API_KEY=xyz. Pending: nope." });
    assert.throws(
      () =>
        buildDraft(
          { learningIds: ["L-bad"], date: DATE, title: "t", summary: "s", now: NOW },
          { logPath, revisionsPath },
        ),
      GuideUpdateError,
    );
  });
});
