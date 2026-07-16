import type { FastifyRequest } from "fastify";

/**
 * Resolve client IP for abuse controls. Prefers first X-Forwarded-For hop when
 * present, then platform client-IP headers (Vercel/CF), then Fastify's parsed IP.
 * The raw value is only used ephemerally for hashing — never logged or stored.
 */
export function resolveClientIp(request: FastifyRequest): string {
  const pick = (name: string): string | null => {
    const raw = request.headers[name];
    if (typeof raw === "string" && raw.trim()) {
      const first = raw.split(",")[0]?.trim();
      return first || null;
    }
    if (Array.isArray(raw) && raw[0]) {
      const first = String(raw[0]).split(",")[0]?.trim();
      return first || null;
    }
    return null;
  };

  return (
    pick("x-forwarded-for") ||
    pick("x-real-ip") ||
    pick("x-vercel-forwarded-for") ||
    pick("cf-connecting-ip") ||
    pick("true-client-ip") ||
    request.ip ||
    "0.0.0.0"
  );
}
