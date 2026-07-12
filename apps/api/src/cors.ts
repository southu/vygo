import type { FastifyInstance } from "fastify";
import { DEFAULT_MARKETING_ORIGINS, isAllowedApiOrigin } from "@vygo/config";

/**
 * Strict origin validation: only the exact allowlist (production marketing
 * origins + configured `CORS_ORIGINS`) and documented vygo Vercel preview
 * origins receive a reflected `Access-Control-Allow-Origin`. Every other origin
 * gets no permissive ACAO, and a `*` wildcard is never emitted.
 */
export function registerCors(app: FastifyInstance, allowedOrigins: string[]): void {
  // Always include the production marketing origins so the deployed frontend is
  // allowed even if CORS_ORIGINS is not explicitly configured on the service.
  const allowlist = new Set<string>([...DEFAULT_MARKETING_ORIGINS, ...allowedOrigins]);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && isAllowedApiOrigin(origin, allowlist)) {
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
