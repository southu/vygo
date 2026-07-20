/**
 * Edge-side HTTP Basic Auth for the job-board internal/admin routes.
 *
 * Reuses the same credential convention as the Railway ops surface
 * (OPS_BASIC_AUTH_USER / OPS_BASIC_AUTH_PASSWORD, see
 * apps/api/src/services/ops-auth.ts) so a single mechanism protects both the
 * /ops/readiness list and the /ops/jobs admin surface. Credentials come only
 * from the process environment — never a request field, never hard-coded.
 *
 * Fail-OPEN when unconfigured: the job-board internal routes were introduced
 * without an auth pattern (they must respond, never 401/5xx — see
 * api/jobs.ts). Until an operator sets OPS_BASIC_AUTH_PASSWORD in the marketing
 * edge environment they stay open, preserving that contract. Once the password
 * is set, the ops Basic-Auth credential is required for every mutating call and
 * the same header unlocks the /ops/jobs admin UI. Comparison is timing-safe.
 */
import { timingSafeEqual } from "node:crypto";
import type { EdgeRequest } from "./http.js";

export type InternalAuthResult = { ok: true } | { ok: false; reason: "missing" | "invalid" };

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Dummy compare to reduce the timing signal from differing lengths.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** True when the internal routes require Basic Auth (i.e. a password is set). */
export function internalAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.OPS_BASIC_AUTH_PASSWORD || "").trim() !== "";
}

/**
 * Verify Authorization: Basic credentials for an internal job-board request.
 * Returns ok when unconfigured (fail-open) or when the credentials match.
 */
export function verifyInternalBasicAuth(
  req: EdgeRequest,
  env: NodeJS.ProcessEnv = process.env,
): InternalAuthResult {
  const expectedPass = (env.OPS_BASIC_AUTH_PASSWORD || "").trim();
  if (!expectedPass) return { ok: true };
  const expectedUser = (env.OPS_BASIC_AUTH_USER || "ops").trim();

  const header = headerValue(req.headers.authorization);
  if (typeof header !== "string" || !header.startsWith("Basic ")) {
    return { ok: false, reason: "missing" };
  }
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return { ok: false, reason: "invalid" };
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);
  if (!safeEqualString(user, expectedUser) || !safeEqualString(pass, expectedPass)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}
