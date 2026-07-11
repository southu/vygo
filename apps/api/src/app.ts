import Fastify from "fastify";
import { checkDatabaseReadiness, createDatabase, type DatabaseHandle } from "@vygo/db";
import {
  CLOUDFLARE_TURNSTILE_TEST_SECRETS,
  isTestSurfaceEnabled,
  loadApiEnv,
  parseCorsOrigins,
  type ApiEnv,
} from "@vygo/config";
import { registerCors } from "./cors.js";
import { errorHandler, safeError } from "./errors.js";
import { buildLoggerOptions } from "./logging.js";
import { resolveRequestId } from "./request-id.js";
import { registerAvailabilityRoutes } from "./routes/availability.js";
import { registerTestSurfaceRoutes } from "./routes/test-surface.js";
import { registerWaitlistRoutes } from "./routes/waitlist.js";
import {
  createRateLimitStore,
  MemoryRateLimitStore,
  type RateLimitStore,
} from "./services/rate-limit.js";
import { createTurnstileVerifier, type TurnstileVerifier } from "./services/turnstile.js";
import type { WaitlistRepositoryOptions } from "@vygo/db";

export type BuildAppOptions = {
  env?: ApiEnv;
  /** Inject a database handle (tests). When omitted, created from DATABASE_URL. */
  database?: DatabaseHandle | null;
  /** Skip opening a real DB connection (unit tests). */
  skipDatabase?: boolean;
  /** Dependency-injected rate limit store (tests). */
  rateLimitStore?: RateLimitStore;
  /** Dependency-injected Turnstile verifier (tests). */
  turnstile?: TurnstileVerifier;
};

export type AppContext = {
  app: ReturnType<typeof Fastify>;
  env: ApiEnv;
  database: DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
  close: () => Promise<void>;
};

function resolveLocalDevDefaults(env: ApiEnv): ApiEnv {
  let next = env;
  // Non-strict environments get a stable local salt so IP hashing works out of the box.
  if (!next.IP_HASH_SALT && isTestSurfaceEnabled(next)) {
    next = {
      ...next,
      IP_HASH_SALT: "vygo-local-dev-ip-hash-salt-v1",
      IP_HASH_SALT_VERSION: next.IP_HASH_SALT_VERSION || 1,
    };
  }
  // Local/CI/ratchet: use Cloudflare official always-pass secret when unset.
  // Production with a real secret is unchanged; request fields can never select this.
  if (!next.TURNSTILE_SECRET_KEY && isTestSurfaceEnabled(next)) {
    next = {
      ...next,
      TURNSTILE_SECRET_KEY: CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses,
    };
  }
  return next;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<AppContext> {
  let env = options.env ?? loadApiEnv();
  env = resolveLocalDevDefaults(env);
  const requestIdHeader = env.REQUEST_ID_HEADER.toLowerCase();

  let database: DatabaseHandle | null = options.database === undefined ? null : options.database;

  if (!options.skipDatabase && options.database === undefined && env.DATABASE_URL) {
    database = createDatabase(env.DATABASE_URL);
  }

  const rateLimitStore =
    options.rateLimitStore ?? (await createRateLimitStore(env.REDIS_URL ?? null));

  const turnstile = createTurnstileVerifier(env, options.turnstile);

  const app = Fastify({
    logger: buildLoggerOptions(env.LOG_LEVEL),
    bodyLimit: env.BODY_LIMIT_BYTES,
    // Honor X-Forwarded-For from the local live reverse proxy for IP hashing / limits.
    trustProxy: true,
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

  // Reject oversized bodies via Content-Length before the parser streams them,
  // so clients (and reverse proxies) receive a clean 413 instead of a reset.
  app.addHook("onRequest", async (request, reply) => {
    const raw = request.headers["content-length"];
    if (raw == null) return;
    const length = Number(Array.isArray(raw) ? raw[0] : raw);
    if (Number.isFinite(length) && length > env.BODY_LIMIT_BYTES) {
      return reply
        .status(413)
        .send(safeError("PAYLOAD_TOO_LARGE", "Request payload is too large."));
    }
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

  const getFaultOptions = (): WaitlistRepositoryOptions => {
    if (!isTestSurfaceEnabled(env)) return {};
    if (env.TEST_FAULT_MODE === "lead") return { faultLead: true };
    if (env.TEST_FAULT_MODE === "outbox") return { faultOutbox: true };
    return {};
  };

  registerWaitlistRoutes(app, {
    env,
    getDb,
    rateLimitStore,
    turnstile,
    getFaultOptions,
  });

  registerTestSurfaceRoutes(app, {
    env,
    getDb,
    rateLimitStore,
    turnstile,
  });

  const close = async () => {
    try {
      await app.close();
    } finally {
      if (rateLimitStore.close) {
        await rateLimitStore.close();
      }
      if (database && options.database === undefined) {
        await database.close();
      }
    }
  };

  return { app, env, database, rateLimitStore, close };
}

export { MemoryRateLimitStore };
