import type { FastifyInstance } from "fastify";
import { DEFAULT_MARKETING_ORIGINS, isAllowedApiOrigin } from "@vygo/config";

/**
 * Paths that intentionally allow cross-origin POSTs from ANY origin, no
 * allowlist check. Only the AI-ingest endpoint: a customer's AI agent runs
 * from an arbitrary host/tool origin (not a browser tab on vygo.ai), so it
 * cannot be restricted to the marketing-site allowlist the way every other
 * (browser-driven) readiness/waitlist endpoint is. The endpoint itself still
 * fails closed on bad tokens, oversized bodies, and rate limits — CORS here
 * only controls which origins a *browser* would let read the response.
 */
const PERMISSIVE_CORS_PATHS = new Set<string>(["/v1/readiness/submit"]);

/**
 * Strict origin validation everywhere except `PERMISSIVE_CORS_PATHS`: only the
 * exact allowlist (production marketing origins + configured `CORS_ORIGINS`)
 * and documented vygo Vercel preview origins receive a reflected
 * `Access-Control-Allow-Origin`. Every other origin gets no permissive ACAO on
 * restricted paths, and a `*` wildcard is never emitted there.
 */
export function registerCors(app: FastifyInstance, allowedOrigins: string[]): void {
  // Always include the production marketing origins so the deployed frontend is
  // allowed even if CORS_ORIGINS is not explicitly configured on the service.
  const allowlist = new Set<string>([...DEFAULT_MARKETING_ORIGINS, ...allowedOrigins]);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const path = request.url.split("?")[0] ?? request.url;
    const permissive = PERMISSIVE_CORS_PATHS.has(path);

    if (permissive) {
      void reply.header("Access-Control-Allow-Origin", typeof origin === "string" ? origin : "*");
      void reply.header("Vary", "Origin");
      void reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
      void reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      void reply.header("Access-Control-Max-Age", "600");
    } else if (typeof origin === "string" && isAllowedApiOrigin(origin, allowlist)) {
      void reply.header("Access-Control-Allow-Origin", origin);
      void reply.header("Vary", "Origin");
      void reply.header("Access-Control-Allow-Credentials", "true");
      void reply.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Request-Id, If-None-Match, Idempotency-Key",
      );
      void reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
      void reply.header("Access-Control-Expose-Headers", "ETag, X-Request-Id, Cache-Control");
      void reply.header("Access-Control-Max-Age", "600");
    }

    if (request.method === "OPTIONS") {
      // Preflight: 204 whether or not origin is allowed (no permissive ACAO if not).
      return reply.status(204).send();
    }
  });
}
