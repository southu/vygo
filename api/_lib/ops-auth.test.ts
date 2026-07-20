/**
 * Edge job-board Basic Auth tests: fail-open when unconfigured, enforce when a
 * password is set, timing-safe credential match.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyInternalBasicAuth, internalAuthConfigured } from "./ops-auth.js";
import type { EdgeRequest } from "./http.js";

function req(authorization?: string): EdgeRequest {
  return { method: "POST", headers: authorization ? { authorization } : {} };
}

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("verifyInternalBasicAuth", () => {
  it("fails open when no password is configured", () => {
    assert.equal(internalAuthConfigured({}), false);
    assert.deepEqual(verifyInternalBasicAuth(req(), {}), { ok: true });
    assert.deepEqual(verifyInternalBasicAuth(req(basic("ops", "x")), {}), { ok: true });
  });

  it("rejects a missing header when configured", () => {
    const env = { OPS_BASIC_AUTH_PASSWORD: "s3cret" } as NodeJS.ProcessEnv;
    assert.equal(internalAuthConfigured(env), true);
    assert.deepEqual(verifyInternalBasicAuth(req(), env), { ok: false, reason: "missing" });
  });

  it("rejects wrong credentials when configured", () => {
    const env = { OPS_BASIC_AUTH_PASSWORD: "s3cret" } as NodeJS.ProcessEnv;
    assert.deepEqual(verifyInternalBasicAuth(req(basic("ops", "nope")), env), {
      ok: false,
      reason: "invalid",
    });
    assert.deepEqual(verifyInternalBasicAuth(req(basic("root", "s3cret")), env), {
      ok: false,
      reason: "invalid",
    });
  });

  it("accepts the configured credentials (default user 'ops')", () => {
    const env = { OPS_BASIC_AUTH_PASSWORD: "s3cret" } as NodeJS.ProcessEnv;
    assert.deepEqual(verifyInternalBasicAuth(req(basic("ops", "s3cret")), env), { ok: true });
  });

  it("accepts a custom configured username", () => {
    const env = {
      OPS_BASIC_AUTH_USER: "admin",
      OPS_BASIC_AUTH_PASSWORD: "s3cret",
    } as NodeJS.ProcessEnv;
    assert.deepEqual(verifyInternalBasicAuth(req(basic("admin", "s3cret")), env), { ok: true });
  });

  it("rejects a malformed Authorization header when configured", () => {
    const env = { OPS_BASIC_AUTH_PASSWORD: "s3cret" } as NodeJS.ProcessEnv;
    assert.deepEqual(verifyInternalBasicAuth(req("Bearer abc"), env), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(verifyInternalBasicAuth(req("Basic not-base64-colonless"), env), {
      ok: false,
      reason: "invalid",
    });
  });
});
