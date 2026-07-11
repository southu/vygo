import { randomUUID } from "node:crypto";

const REQUEST_ID_RE = /^[\w.:-]{1,128}$/;

/**
 * Request-ID contract:
 * - Inbound `X-Request-Id` (or configured header) is propagated when valid.
 * - Otherwise a new UUID is generated.
 * - Response always includes `X-Request-Id` with the effective id.
 */
export function resolveRequestId(inbound: string | string[] | undefined): string {
  const raw = Array.isArray(inbound) ? inbound[0] : inbound;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (REQUEST_ID_RE.test(trimmed)) {
      return trimmed;
    }
  }
  return randomUUID();
}
