import type { FastifyRequest } from "fastify";

/**
 * Resolve client IP for abuse controls. Prefers first X-Forwarded-For hop when present.
 * The raw value is only used ephemerally for hashing — never logged or stored.
 */
export function resolveClientIp(request: FastifyRequest): string {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(xff) && xff[0]) {
    const first = String(xff[0]).split(",")[0]?.trim();
    if (first) return first;
  }
  return request.ip || "0.0.0.0";
}
