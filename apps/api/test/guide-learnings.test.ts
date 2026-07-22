import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { registerGuideLearningsRoutes } from "../src/routes/guide-learnings.js";

/**
 * Route-level tests for the guide-progress learnings API. Registered against a
 * throwaway log file so they run with no database and never touch the canonical
 * store.
 */
describe("guide learnings API", () => {
  let app: FastifyInstance;
  let logPath: string;

  before(async () => {
    const dir = mkdtempSync(join(tmpdir(), "guide-learnings-"));
    logPath = join(dir, "ratchet-learnings.json");
    writeFileSync(
      logPath,
      JSON.stringify({
        entries: [
          {
            id: "L-seed-incorporated",
            summary: "An incorporated learning.",
            date: "2026-07-10",
            source_link: "https://example.com/a",
            affected_sections: ["core-workflow"],
            status: "incorporated",
            created: "2026-07-10T00:00:00.000Z",
            updated: "2026-07-10T00:00:00.000Z",
            incorporated_date: "2026-07-12",
          },
          {
            id: "L-seed-pending",
            summary: "A pending learning.",
            date: "2026-07-11",
            source_link: "https://example.com/b",
            affected_sections: ["operations"],
            status: "pending-in-guide",
            created: "2026-07-11T00:00:00.000Z",
            updated: "2026-07-11T00:00:00.000Z",
          },
        ],
      }),
    );
    app = Fastify();
    registerGuideLearningsRoutes(app, { logPath });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it("GET returns counts that match the store and full learning shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/guide/learnings" });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["cache-control"] ?? "", /no-store/);
    const body = res.json();
    assert.equal(body.guide_last_updated, "2026-07-12");
    assert.equal(body.counts.pending, 1);
    assert.equal(body.counts.incorporated, 1);
    assert.equal(body.learnings.length, 2);
    const pendingCount = body.learnings.filter(
      (l: { status: string }) => l.status === "pending",
    ).length;
    const incorporatedCount = body.learnings.filter(
      (l: { status: string }) => l.status === "incorporated",
    ).length;
    assert.equal(body.counts.pending, pendingCount);
    assert.equal(body.counts.incorporated, incorporatedCount);
    for (const learning of body.learnings) {
      assert.equal(typeof learning.summary, "string");
      assert.equal(typeof learning.source, "string");
      assert.ok(learning.status === "pending" || learning.status === "incorporated");
      assert.ok(Array.isArray(learning.sections));
    }
    // Incorporated learnings carry their per-entry incorporation date so the
    // learnings dashboard can show an incorporation timestamp per learning.
    const incorporated = body.learnings.find((l: { id: string }) => l.id === "L-seed-incorporated");
    assert.equal(incorporated.incorporated_date, "2026-07-12");
    const pending = body.learnings.find((l: { id: string }) => l.id === "L-seed-pending");
    assert.equal(pending.incorporated_date, undefined);
  });

  it("POST appends a pending learning and bumps the pending count by one", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/guide/learnings",
      payload: {
        summary: "New learning captured via POST.",
        source: "https://example.com/new",
        sections: ["core-workflow", "footguns"],
      },
    });
    assert.equal(create.statusCode, 201);
    const stored = create.json();
    assert.equal(stored.status, "pending");
    assert.equal(stored.summary, "New learning captured via POST.");
    assert.equal(stored.source, "https://example.com/new");
    assert.deepEqual(stored.sections, ["core-workflow", "footguns"]);

    const reload = await app.inject({ method: "GET", url: "/api/guide/learnings" });
    const body = reload.json();
    assert.equal(body.counts.pending, 2);
    assert.equal(body.counts.incorporated, 1);
    assert.ok(
      body.learnings.some(
        (l: { summary: string; status: string }) =>
          l.summary === "New learning captured via POST." && l.status === "pending",
      ),
    );
  });

  it("POST rejects a body missing required fields with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/guide/learnings",
      payload: { summary: "no source or sections" },
    });
    assert.equal(res.statusCode, 400);
  });
});
