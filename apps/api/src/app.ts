import Fastify from "fastify";
import {
  checkDatabaseReadiness,
  createDatabase,
  getWorkerHeartbeat,
  isWorkerHeartbeatFresh,
  runMigrations,
  type DatabaseHandle,
} from "@vygo/db";
import {
  CLOUDFLARE_TURNSTILE_TEST_SECRETS,
  getDeployedGitSha,
  isTestSurfaceEnabled,
  loadApiEnv,
  parseCorsOrigins,
  type ApiEnv,
} from "@vygo/config";
import { createEmailWorker, type EmailWorkerHandle } from "@vygo/worker";
import { registerCors } from "./cors.js";
import { errorHandler, safeError } from "./errors.js";
import { buildLoggerOptions } from "./logging.js";
import { resolveRequestId } from "./request-id.js";
import { registerAvailabilityRoutes } from "./routes/availability.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics.js";
import { registerTestSurfaceRoutes, TEST_SUPPORT_ROUTES } from "./routes/test-surface.js";
import { registerWaitlistRoutes } from "./routes/waitlist.js";
import { registerGuideLearningsRoutes } from "./routes/guide-learnings.js";
import { registerApplyRoutes } from "./routes/apply.js";
import { registerReadinessRoutes } from "./routes/readiness.js";
import { registerAnalysesRoutes } from "./routes/analyses.js";
import { registerOpsRoutes } from "./routes/ops.js";
import { registerResendWebhookRoutes } from "./routes/webhooks-resend.js";
import {
  createRateLimitStore,
  MemoryRateLimitStore,
  type RateLimitStore,
} from "./services/rate-limit.js";
import { consumeTestFault } from "./services/test-fault.js";
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
  /** Disable in-process email worker (tests). */
  skipInlineWorker?: boolean;
};

export type AppContext = {
  app: ReturnType<typeof Fastify>;
  env: ApiEnv;
  database: DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
  emailWorker: EmailWorkerHandle | null;
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
  // When TURNSTILE_SECRET_KEY is unset, use Cloudflare's official always-pass
  // test secret so score/waitlist verification can succeed. Real production
  // secrets must be set on Railway (or vault-backed shared vars). Request
  // fields can never select this path — server config only.
  // Applies even when ENABLE_TEST_SURFACE=false: a missing secret would
  // otherwise fail every intake with not_configured / TURNSTILE_FAILED.
  if (!next.TURNSTILE_SECRET_KEY) {
    next = {
      ...next,
      TURNSTILE_SECRET_KEY: CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses,
    };
  }
  return next;
}

function shouldRunInlineWorker(env: ApiEnv, options: BuildAppOptions): boolean {
  if (options.skipInlineWorker) return false;
  if (env.INLINE_EMAIL_WORKER === "false") return false;
  if (env.INLINE_EMAIL_WORKER === "true") return true;
  // Never auto-start during unit/integration test process (keeps node:test from hanging).
  if (env.NODE_ENV === "test") return false;
  // Default on for test surface / local live harness so GET /health can report worker ready.
  return isTestSurfaceEnabled(env);
}

export async function buildApp(options: BuildAppOptions = {}): Promise<AppContext> {
  let env = options.env ?? loadApiEnv();
  env = resolveLocalDevDefaults(env);
  const requestIdHeader = env.REQUEST_ID_HEADER.toLowerCase();

  let database: DatabaseHandle | null = options.database === undefined ? null : options.database;

  if (!options.skipDatabase && options.database === undefined && env.DATABASE_URL) {
    database = createDatabase(env.DATABASE_URL);
    // Best-effort schema migrate so new tables (e.g. applications) exist after deploy.
    // Failures are logged but do not block listen — handlers also CREATE TABLE IF NOT EXISTS.
    try {
      await runMigrations(env.DATABASE_URL);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "startup_migrate_failed",
          message: error instanceof Error ? error.message : "migrate failed",
        }),
      );
    }
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

  // Register CORS before other onRequest hooks so every early-rejection
  // response (oversized body, etc.) still carries the right ACAO headers for
  // browser-driven cross-origin callers.
  registerCors(app, parseCorsOrigins(env));

  // Reject oversized bodies via Content-Length before the parser streams them,
  // so clients (and reverse proxies) receive a clean 413 instead of a reset.
  app.addHook("onRequest", async (request, reply) => {
    const raw = request.headers["content-length"];
    if (raw == null) return;
    const length = Number(Array.isArray(raw) ? raw[0] : raw);
    if (Number.isFinite(length) && length > env.BODY_LIMIT_BYTES) {
      request.log.info(
        { event: "request_rejected", reason: "payload_too_large", path: request.url.split("?")[0] },
        "request rejected: payload too large",
      );
      return reply
        .status(413)
        .send(safeError("PAYLOAD_TOO_LARGE", "Request payload is too large."));
    }
  });

  const getDb = () => database;

  let emailWorker: EmailWorkerHandle | null = null;
  if (database && shouldRunInlineWorker(env, options)) {
    emailWorker = createEmailWorker({
      database,
      resendApiKey: env.RESEND_API_KEY,
      emailFrom: env.EMAIL_FROM ?? "Vygo <hello@vygo.ai>",
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
      batchSize: env.WORKER_BATCH_SIZE,
      maxAttempts: env.WORKER_MAX_ATTEMPTS,
      workerName: "email-worker",
    });
    // Fire-and-forget; errors are logged inside the worker.
    void emailWorker.start().catch((error) => {
      app.log.error(
        { event: "inline_worker_start_failed" },
        error instanceof Error ? error.message : "inline worker start failed",
      );
    });
  }

  /** Process liveness — no dependency checks. */
  app.get("/healthz", async () => ({
    ok: true,
    healthy: true,
    service: "vygo-api",
  }));

  /**
   * Deployed git SHA for Ratchet's version-endpoint deploy gate.
   * Plain text so a ≥7-hex-character body is returned verbatim. The SHA comes
   * from a documented build-metadata env var (VERCEL_GIT_COMMIT_SHA / COMMIT_SHA
   * / GIT_COMMIT_SHA / GITHUB_SHA); "unknown" only when none is configured.
   */
  app.get("/version", async (_request, reply) => {
    const sha = getDeployedGitSha();
    return reply.type("text/plain; charset=utf-8").send(sha || "unknown");
  });

  /**
   * Composite readiness for live verification: API process + database + email worker.
   * Never exposes credentials, signing secrets, authorization headers, email bodies, or applicant data.
   */
  app.get("/health", async (_request, reply) => {
    const sha = getDeployedGitSha() || undefined;
    const api = { ready: true as const, service: "vygo-api" };

    let databaseStatus: { ready: boolean; status: string } = {
      ready: false,
      status: "unavailable",
    };
    if (database) {
      const result = await checkDatabaseReadiness(database.sql, "vygo-api");
      databaseStatus = {
        ready: result.ready,
        status: result.ready ? "ok" : "not_ready",
      };
    } else if (!env.DATABASE_URL) {
      databaseStatus = { ready: false, status: "not_configured" };
    }

    let workerStatus: {
      ready: boolean;
      status: string;
      inline: boolean;
      lastSeenAt?: string;
    } = {
      ready: false,
      status: "unavailable",
      inline: Boolean(emailWorker),
    };

    if (database) {
      const heartbeat = await getWorkerHeartbeat(database.db, "email-worker");
      const fresh = isWorkerHeartbeatFresh(heartbeat, {
        maxAgeMs: env.WORKER_HEARTBEAT_MAX_AGE_MS,
      });
      // Also treat a running in-process worker as ready even if the first heartbeat
      // has not landed yet (startup race with /health probes).
      const inlineRunning = Boolean(emailWorker?.isRunning());
      workerStatus = {
        ready: fresh || inlineRunning,
        status: fresh ? "ok" : inlineRunning ? "starting" : "stale_or_missing",
        inline: Boolean(emailWorker),
        lastSeenAt: heartbeat?.lastSeenAt?.toISOString(),
      };
    }

    const ready = api.ready && databaseStatus.ready && workerStatus.ready;
    const body = {
      ready,
      service: "vygo",
      commit: sha,
      checks: {
        api,
        database: databaseStatus,
        emailWorker: workerStatus,
      },
    };

    return reply.status(ready ? 200 : 503).send(body);
  });

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
    // Advertise discoverable test surface base path only when enabled (non-prod).
    // Existing readiness fields are preserved; production-strict omits testSupport.
    if (isTestSurfaceEnabled(env)) {
      return reply.status(200).send({
        ...result,
        testSupport: TEST_SUPPORT_ROUTES.index,
      });
    }
    return reply.status(200).send(result);
  });

  registerAvailabilityRoutes(app, getDb);

  const getFaultOptions = (): WaitlistRepositoryOptions => {
    if (!isTestSurfaceEnabled(env)) return {};
    // Prefer in-process armed fault (HTTP test-support control) over static env.
    const armed = consumeTestFault();
    if (armed.faultLead || armed.faultOutbox) return armed;
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

  registerApplyRoutes(app, { getDb });

  // Ratchet guide-progress learnings store (public product-progress data; no auth).
  registerGuideLearningsRoutes(app);

  registerReadinessRoutes(app, {
    env,
    getDb,
    rateLimitStore,
    turnstile,
  });

  // Readiness analyses store (lead follow-up): many analyses per user, keyed by
  // (user, project). Aliased as /api/analyses on the marketing edge.
  registerAnalysesRoutes(app, {
    env,
    getDb,
    rateLimitStore,
  });

  // Internal ops (readiness list / brief / CSV) — Basic Auth via OPS_BASIC_AUTH_*.
  registerOpsRoutes(app, {
    env,
    getDb,
  });

  registerResendWebhookRoutes(app, {
    env,
    getDb,
  });

  // Safe diagnostic surface for live verification (no secrets / no applicant PII).
  registerDiagnosticsRoutes(app, {
    env,
    getDb,
  });

  registerTestSurfaceRoutes(app, {
    env,
    getDb,
    rateLimitStore,
    turnstile,
  });

  const close = async () => {
    try {
      if (emailWorker) {
        await emailWorker.stop();
      }
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

  return { app, env, database, rateLimitStore, emailWorker, close };
}

export { MemoryRateLimitStore };
