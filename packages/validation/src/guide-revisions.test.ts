import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRevision,
  assertAdditiveRevisions,
  DEFAULT_GUIDE_REVISIONS_PATH,
  GuideRevisionsError,
  guideRevisionsSchema,
  nextRevisionId,
  readGuideRevisions,
  revisionForLearning,
  writeGuideRevisions,
  type GuideRevision,
} from "./guide-revisions.js";

function sampleRevision(overrides: Partial<GuideRevision> = {}): GuideRevision {
  return {
    id: "GR-2026-07-22-001",
    date: "2026-07-22",
    title: "Test revision",
    summary: "A revision for tests.",
    published_via: "git",
    learnings: [{ id: "L-001", name: "First learning", incorporated_date: "2026-07-22" }],
    created: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("guide-revisions store", () => {
  let dir: string;
  let revPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "guide-rev-"));
    revPath = join(dir, "guide-revisions.json");
    writeFileSync(revPath, `${JSON.stringify({ revisions: [] }, null, 2)}\n`, "utf8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads an empty store when the file is missing", () => {
    const store = readGuideRevisions(join(dir, "does-not-exist.json"));
    assert.deepEqual(store, { revisions: [] });
  });

  it("appends a revision and round-trips it", () => {
    const saved = appendRevision(sampleRevision(), { path: revPath });
    assert.equal(saved.id, "GR-2026-07-22-001");
    const store = readGuideRevisions(revPath);
    assert.equal(store.revisions.length, 1);
    assert.deepEqual(store.revisions[0], sampleRevision());
  });

  it("assigns monotonically increasing revision ids", () => {
    assert.equal(nextRevisionId({ revisions: [] }, "2026-07-22"), "GR-2026-07-22-001");
    appendRevision(sampleRevision(), { path: revPath });
    const next = nextRevisionId(readGuideRevisions(revPath), "2026-07-23");
    assert.equal(next, "GR-2026-07-23-002");
  });

  it("rejects a duplicate revision id", () => {
    appendRevision(sampleRevision(), { path: revPath });
    assert.throws(
      () => appendRevision(sampleRevision({ title: "dup" }), { path: revPath }),
      GuideRevisionsError,
    );
  });

  it("rejects deleting an existing revision", () => {
    appendRevision(sampleRevision(), { path: revPath });
    assert.throws(
      () => writeGuideRevisions({ revisions: [] }, { path: revPath }),
      (err: unknown) => {
        assert.ok(err instanceof GuideRevisionsError);
        assert.match(err.message, /deleted/);
        return true;
      },
    );
    assert.equal(readGuideRevisions(revPath).revisions.length, 1);
  });

  it("rejects rewriting an existing revision", () => {
    appendRevision(sampleRevision(), { path: revPath });
    const tampered = { revisions: [sampleRevision({ title: "rewritten" })] };
    assert.throws(
      () => writeGuideRevisions(tampered, { path: revPath }),
      (err: unknown) => {
        assert.ok(err instanceof GuideRevisionsError);
        assert.match(err.message, /rewritten/);
        return true;
      },
    );
    assert.equal(readGuideRevisions(revPath).revisions[0]?.title, "Test revision");
  });

  it("rejects a revision with an invalid id shape or no learnings", () => {
    assert.throws(() => appendRevision(sampleRevision({ id: "bad-id" }), { path: revPath }));
    assert.throws(() => appendRevision(sampleRevision({ learnings: [] }), { path: revPath }));
  });

  it("rejects a non-YYYY-MM-DD incorporated_date", () => {
    assert.throws(() =>
      appendRevision(
        sampleRevision({
          learnings: [{ id: "L-001", name: "x", incorporated_date: "2026-07-22T00:00:00.000Z" }],
        }),
        { path: revPath },
      ),
    );
  });

  it("finds the revision that incorporated a learning", () => {
    appendRevision(sampleRevision(), { path: revPath });
    const store = readGuideRevisions(revPath);
    assert.equal(revisionForLearning(store, "L-001")?.id, "GR-2026-07-22-001");
    assert.equal(revisionForLearning(store, "L-nope"), undefined);
  });

  it("assertAdditiveRevisions permits appending brand-new revisions", () => {
    assert.doesNotThrow(() =>
      assertAdditiveRevisions({ revisions: [] }, { revisions: [sampleRevision()] }),
    );
  });
});

describe("committed guide-revisions store", () => {
  it("the committed store is valid and additive-consistent", () => {
    const raw = JSON.parse(readFileSync(DEFAULT_GUIDE_REVISIONS_PATH, "utf8"));
    const parsed = guideRevisionsSchema.safeParse(raw);
    assert.ok(parsed.success, "committed guide-revisions.json must match the schema");
    const ids = new Set(parsed.data!.revisions.map((r) => r.id));
    assert.equal(ids.size, parsed.data!.revisions.length, "revision ids must be unique");
  });
});
