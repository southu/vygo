import Fastify from "fastify";
import { loadApiEnv } from "@vygo/config";
import { dbPackageName } from "@vygo/db";

const env = loadApiEnv();

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
  bodyLimit: 64 * 1024,
});

app.get("/healthz", async () => ({
  ok: true,
  service: "vygo-api",
  dbPackage: dbPackageName,
}));

app.get("/readyz", async (_request, reply) => {
  // Dependency-aware readiness is implemented when DATABASE_URL / Redis are wired.
  if (!env.DATABASE_URL) {
    return reply.status(503).send({
      ready: false,
      reason: "DATABASE_URL not configured",
    });
  }
  return { ready: true, service: "vygo-api" };
});

async function main() {
  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`vygo API listening at ${address}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
