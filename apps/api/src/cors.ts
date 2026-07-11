import type { FastifyInstance } from "fastify";

/**
 * Strict origin validation: only configured origins receive
 * Access-Control-Allow-Origin. Unconfigured origins get no permissive ACAO.
 */
export function registerCors(app: FastifyInstance, allowedOrigins: string[]): void {
  const allowlist = new Set(allowedOrigins);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && allowlist.has(origin)) {
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
