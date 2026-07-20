/**
 * Edge job-board Basic Auth tests: always gated (eval default when unconfigured,
 * configured password when set), timing-safe credential match.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verifyInternalBasicAuth,
  internalAuthConfigured,
  EVAL_DEFAULT_USER,
  EVAL_DEFAULT_PASSWORD,
} from "./ops-auth.js";
import type { EdgeRequest } from "./http.js";

function req(authorization?: string): EdgeRequest {
  return { method: "POST", headers: authorization ? { authorization } : {} };
}

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("verifyInternalBasicAuth", () => {
  it("requires the eval default credential when no password is configured", () => {
    assert.equal(internalAuthConfigured({}), false);
    // Anonymous / wrong requests are refused even without a configured password.
    assert.deepEqual(verifyInternalBasicAuth(req(), {}), { ok: false, reason: "missing" });
    assert.deepEqual(verifyInternalBasicAuth(req(basic("ops", "x")), {}), {
      ok: false,
      reason: "invalid",
    });
    // The non-secret eval default authenticates.
    assert.deepEqual(
      verifyInternalBasicAuth(req(basic(EVAL_DEFAULT_USER, EVAL_DEFAULT_PASSWORD)), {}),
      { ok: true },
    );
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
