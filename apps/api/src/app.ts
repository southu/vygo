import Fastify from "fastify";
import { checkDatabaseReadiness, createDatabase, type DatabaseHandle } from "@vygo/db";
import { loadApiEnv, parseCorsOrigins, type ApiEnv } from "@vygo/config";
import { registerCors } from "./cors.js";
import { errorHandler } from "./errors.js";
import { buildLoggerOptions } from "./logging.js";
import { resolveRequestId } from "./request-id.js";
import { registerAvailabilityRoutes } from "./routes/availability.js";

export type BuildAppOptions = {
  env?: ApiEnv;
  /** Inject a database handle (tests). When omitted, created from DATABASE_URL. */
  database?: DatabaseHandle | null;
  /** Skip opening a real DB connection (unit tests). */
  skipDatabase?: boolean;
};

export type AppContext = {
  app: ReturnType<typeof Fastify>;
  env: ApiEnv;
  database: DatabaseHandle | null;
  close: () => Promise<void>;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<AppContext> {
  const env = options.env ?? loadApiEnv();
  const requestIdHeader = env.REQUEST_ID_HEADER.toLowerCase();

  let database: DatabaseHandle | null = options.database === undefined ? null : options.database;

  if (!options.skipDatabase && options.database === undefined && env.DATABASE_URL) {
    database = createDatabase(env.DATABASE_URL);
  }

  const app = Fastify({
    logger: buildLoggerOptions(env.LOG_LEVEL),
    bodyLimit: env.BODY_LIMIT_BYTES,
    requestIdHeader,
    genReqId: (req) => {
      const inbound = req.headers[requestIdHeader] ?? req.headers["x-request-id"];
      return resolveRequestId(inbound);
    },
  });

  app.setErrorHandler(errorHandler);

  // Always echo request id on responses.
  app.addHook("onSend", async (request, reply, payload) => {
    void reply.header("X-Request-Id", request.id);
    return payload;
  });

  registerCors(app, parseCorsOrigins(env));

  const getDb = () => database;

  /** Process liveness — no dependency checks. */
  app.get("/healthz", async () => ({
    ok: true,
    healthy: true,
    service: "vygo-api",
  }));

  /** Dependency-aware readiness: PostgreSQL + required migrations/schema. */
  app.get("/readyz", async (_request, reply) => {
    if (!env.DATABASE_URL && !database) {
      return reply.status(503).send({
        ready: false,
        service: "vygo-api",
        reason: "DATABASE_URL not configured",
      });
    }

    if (!database) {
      return reply.status(503).send({
        ready: false,
        service: "vygo-api",
        reason: "Database client is not available",
      });
    }

    const result = await checkDatabaseReadiness(database.sql, "vygo-api");
    if (!result.ready) {
      return reply.status(503).send(result);
    }
    return reply.status(200).send(result);
  });

  registerAvailabilityRoutes(app, getDb);

  /**
   * Placeholder waitlist route so body-size limits and safe error handling are
   * exercised before the full waitlist mission lands. Always returns 501 for
   * valid-sized JSON bodies.
   */
  app.post("/v1/waitlist", async (_request, reply) => {
    return reply.status(501).send({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Waitlist submissions are not enabled yet.",
      },
    });
  });

  const close = async () => {
    try {
      await app.close();
    } finally {
      if (database && options.database === undefined) {
        await database.close();
      }
    }
  };

  return { app, env, database, close };
}
