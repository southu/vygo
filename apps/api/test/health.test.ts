/**
 * Focused, database-free tests for the deploy-gate-critical routes:
 * liveness (/healthz), version (/version), and unknown-path handling.
 *
 * These build the app with skipDatabase so they run without Postgres, keeping
 * the health/version surface covered even when no database is available.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadApiEnv } from "@vygo/config";
import { buildApp, type AppContext } from "../src/app.js";

let ctx: AppContext;
const originalCommitSha = process.env.COMMIT_SHA;
const FAKE_SHA = "abc1234def5678";

before(async () => {
  // getDeployedGitSha() reads build metadata from process.env at request time.
  process.env.COMMIT_SHA = FAKE_SHA;
  ctx = await buildApp({
    env: loadApiEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      CORS_ORIGINS: "http://localhost:3000",
      COMMIT_SHA: FAKE_SHA,
    }),
    skipDatabase: true,
    skipInlineWorker: true,
  });
  await ctx.app.ready();
});

after(async () => {
  await ctx.close();
  if (originalCommitSha === undefined) {
    delete process.env.COMMIT_SHA;
  } else {
    process.env.COMMIT_SHA = originalCommitSha;
  }
});

describe("GET /healthz", () => {
  it("returns 200 with an explicit healthy status and no dependency checks", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/healthz" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.healthy, true);
    assert.equal(body.service, "vygo-api");
  });
});

describe("GET /version", () => {
  it("returns 200 with the deployed git SHA as plain text", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/version" });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] ?? "", /text\/plain/);
    assert.equal(res.body, FAKE_SHA);
    assert.match(res.body, /^[0-9a-f]{7,40}$/i);
  });
});

describe("unknown routes", () => {
  it("returns 404 without crashing the service", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/definitely-not-a-route" });
    assert.equal(res.statusCode, 404);
  });
});
