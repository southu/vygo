/**
 * HTTP Basic Auth for internal ops routes.
 *
 * Credentials come only from process environment (OPS_BASIC_AUTH_USER /
 * OPS_BASIC_AUTH_PASSWORD). Fail closed when password is unset — never a
 * request-field bypass. Timing-safe comparison on both user and password.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiEnv } from "@vygo/config";
import { safeError } from "../errors.js";

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still do a dummy compare to reduce timing signal on length.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export type OpsAuthResult =
  | { ok: true; user: string }
  | { ok: false; status: 401; reason: "missing" | "invalid" | "not_configured" };

/**
 * Verify Authorization: Basic credentials against env.
 * Does not write the response — callers decide status body.
 */
export function verifyOpsBasicAuth(
  request: FastifyRequest,
  env: Pick<ApiEnv, "OPS_BASIC_AUTH_USER" | "OPS_BASIC_AUTH_PASSWORD">,
): OpsAuthResult {
  const expectedUser = (env.OPS_BASIC_AUTH_USER || "ops").trim();
  const expectedPass = (env.OPS_BASIC_AUTH_PASSWORD || "").trim();
  if (!expectedPass) {
    return { ok: false, status: 401, reason: "not_configured" };
  }

  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Basic ")) {
    return { ok: false, status: 401, reason: "missing" };
  }

  let decoded = "";
  try {
    decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return { ok: false, status: 401, reason: "invalid" };
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) {
    return { ok: false, status: 401, reason: "invalid" };
  }
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  const userOk = safeEqualString(user, expectedUser);
  const passOk = safeEqualString(pass, expectedPass);
  if (!userOk || !passOk) {
    return { ok: false, status: 401, reason: "invalid" };
  }
  return { ok: true, user };
}

/**
 * Enforce ops Basic Auth. Returns true when the request may proceed.
 * On failure: 401 + WWW-Authenticate so browsers prompt, body is safe JSON.
 */
export async function requireOpsAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  env: Pick<ApiEnv, "OPS_BASIC_AUTH_USER" | "OPS_BASIC_AUTH_PASSWORD">,
): Promise<boolean> {
  const result = verifyOpsBasicAuth(request, env);
  if (result.ok) return true;

  void reply.header("WWW-Authenticate", 'Basic realm="Vygo Ops", charset="UTF-8"');
  void reply.header("Cache-Control", "no-store");
  const message =
    result.reason === "not_configured"
      ? "Ops authentication is not configured."
      : "Authentication required.";
  await reply.status(401).send(safeError("UNAUTHORIZED", message));
  return false;
}
