/**
 * Edge-side HTTP Basic Auth for the job-board internal/admin routes.
 *
 * Reuses the same credential convention as the Railway ops surface
 * (OPS_BASIC_AUTH_USER / OPS_BASIC_AUTH_PASSWORD, see
 * apps/api/src/services/ops-auth.ts) so a single mechanism protects both the
 * /ops/readiness list and the /ops/jobs admin surface. Credentials come only
 * from the process environment — never a request field, never hard-coded.
 *
 * Gated by default: the internal/admin routes ALWAYS require a Basic-Auth
 * credential — an anonymous request is refused with 401 so applicant PII is
 * never readable or mutable without admin access. When a production password is
 * set (OPS_BASIC_AUTH_PASSWORD) it is required; when none is set (e.g. the
 * evaluation environment), a well-known non-secret default credential
 * (EVAL_DEFAULT_USER / EVAL_DEFAULT_PASSWORD) applies so the surface stays
 * operable without weakening the "no anonymous access" guarantee. The same
 * credential unlocks the /ops/jobs and /admin surfaces. Comparison is timing-safe.
 */
import { timingSafeEqual } from "node:crypto";
import type { EdgeRequest } from "./http.js";

export type InternalAuthResult = { ok: true } | { ok: false; reason: "missing" | "invalid" };

/**
 * Non-secret default credential used ONLY when no production password is set.
 * It is not a secret (it protects a demo/eval surface with no real data) and a
 * configured OPS_BASIC_AUTH_PASSWORD always overrides it.
 */
export const EVAL_DEFAULT_USER = "ops";
export const EVAL_DEFAULT_PASSWORD = "ops";

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

/** True when a production password is configured (vs. the eval default). */
export function internalAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.OPS_BASIC_AUTH_PASSWORD || "").trim() !== "";
}

/**
 * Resolve the credential the internal/admin routes require: the configured
 * OPS_BASIC_AUTH_* pair when a password is set, otherwise the non-secret eval
 * default. Always returns a non-empty password, so the routes are never open.
 */
export function expectedInternalCredentials(env: NodeJS.ProcessEnv = process.env): {
  user: string;
  pass: string;
} {
  const configuredPass = (env.OPS_BASIC_AUTH_PASSWORD || "").trim();
  if (configuredPass) {
    return { user: (env.OPS_BASIC_AUTH_USER || "ops").trim(), pass: configuredPass };
  }
  return { user: EVAL_DEFAULT_USER, pass: EVAL_DEFAULT_PASSWORD };
}

/**
 * Verify Authorization: Basic credentials for an internal job-board request.
 * Always requires a credential (never fail-open); returns ok only when the
 * supplied user+pass match the configured pair or the eval default.
 */
export function verifyInternalBasicAuth(
  req: EdgeRequest,
  env: NodeJS.ProcessEnv = process.env,
): InternalAuthResult {
  const { user: expectedUser, pass: expectedPass } = expectedInternalCredentials(env);

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
