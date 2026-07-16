import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyOpsBasicAuth } from "./ops-auth.js";
import type { FastifyRequest } from "fastify";

function req(authorization?: string): FastifyRequest {
  return { headers: authorization ? { authorization } : {} } as FastifyRequest;
}

describe("verifyOpsBasicAuth", () => {
  it("fails closed when password is not configured", () => {
    const result = verifyOpsBasicAuth(req("Basic b3BzOnNlY3JldA=="), {
      OPS_BASIC_AUTH_USER: "ops",
      OPS_BASIC_AUTH_PASSWORD: undefined,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_configured");
  });

  it("rejects missing Authorization header", () => {
    const result = verifyOpsBasicAuth(req(), {
      OPS_BASIC_AUTH_USER: "ops",
      OPS_BASIC_AUTH_PASSWORD: "secret",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing");
  });

  it("accepts valid basic credentials", () => {
    const token = Buffer.from("ops:secret", "utf8").toString("base64");
    const result = verifyOpsBasicAuth(req(`Basic ${token}`), {
      OPS_BASIC_AUTH_USER: "ops",
      OPS_BASIC_AUTH_PASSWORD: "secret",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.user, "ops");
  });

  it("rejects wrong password", () => {
    const token = Buffer.from("ops:wrong", "utf8").toString("base64");
    const result = verifyOpsBasicAuth(req(`Basic ${token}`), {
      OPS_BASIC_AUTH_USER: "ops",
      OPS_BASIC_AUTH_PASSWORD: "secret",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid");
  });
});
