import { randomUUID } from "node:crypto";
import {
  claimOutboxJobs,
  createDatabase,
  upsertWorkerHeartbeat,
  DEFAULT_MAX_ATTEMPTS,
  type DatabaseHandle,
  type Db,
} from "@vygo/db";
import { processOutboxJob } from "./process-job.js";
import { createEmailTransport, type EmailTransport } from "./transport.js";
import { safeLog } from "./redact.js";

export type EmailWorkerOptions = {
  databaseUrl?: string;
  database?: DatabaseHandle;
  db?: Db;
  transport?: EmailTransport;
  resendApiKey?: string | null;
  emailFrom?: string;
  workerName?: string;
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  heartbeatIntervalMs?: number;
  /** When true, process one poll cycle then stop (tests / WORKER_ONCE). */
  once?: boolean;
  /** Stop automatically after this many ms (tests). */
  runForMs?: number;
};

export type EmailWorkerHandle = {
  workerId: string;
  workerName: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  /** Run a single drain cycle (claim + process). */
  tick: () => Promise<{ claimed: number; sent: number; retry: number; deadLetter: number }>;
};

/**
 * Database-backed outbox worker with SKIP LOCKED claiming, retries, dead-letter,
 * heartbeat, and graceful shutdown.
 */
export function createEmailWorker(options: EmailWorkerOptions = {}): EmailWorkerHandle {
  const workerName = options.workerName ?? "email-worker";
  const workerId = options.workerId ?? `${workerName}:${randomUUID().slice(0, 8)}`;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const batchSize = options.batchSize ?? 10;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
  const emailFrom = options.emailFrom ?? "Vygo <hello@vygo.ai>";

  let ownDatabase: DatabaseHandle | null = null;
  let db: Db | null = options.db ?? options.database?.db ?? null;
  const transport =
    options.transport ??
    createEmailTransport({
      apiKey: options.resendApiKey,
      forceMock: !options.resendApiKey,
    });

  let running = false;
  let stopping = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<unknown> | null = null;

  const getDb = async (): Promise<Db> => {
    if (db) return db;
    if (!options.databaseUrl) {
      throw new Error("DATABASE_URL is required for the email worker");
    }
    ownDatabase = createDatabase(options.databaseUrl);
    db = ownDatabase.db;
    return db;
  };

  const heartbeat = async () => {
    try {
      const database = await getDb();
      await upsertWorkerHeartbeat(database, {
        workerName,
        status: stopping ? "stopping" : "ready",
        details: {
          workerId,
          mockTransport: !options.resendApiKey && !options.transport,
        },
      });
    } catch (error) {
      safeLog(
        "warn",
        { event: "heartbeat_failed", err: error instanceof Error ? error.message : "error" },
        "heartbeat failed",
      );
    }
  };

  const tick = async () => {
    const database = await getDb();
    const claimed = await claimOutboxJobs(database, {
      workerId,
      limit: batchSize,
    });
    let sent = 0;
    let retry = 0;
    let deadLetter = 0;
    for (const job of claimed) {
      if (stopping) break;
      const outcome = await processOutboxJob(job, {
        db: database,
        transport,
        from: emailFrom,
        maxAttempts,
      });
      if (outcome === "sent") sent += 1;
      else if (outcome === "retry") retry += 1;
      else deadLetter += 1;
    }
    return { claimed: claimed.length, sent, retry, deadLetter };
  };

  const scheduleNext = () => {
    if (stopping || !running) return;
    pollTimer = setTimeout(() => {
      void (async () => {
        if (stopping) return;
        inFlight = tick()
          .catch((error) => {
            safeLog(
              "error",
              { event: "poll_failed", err: error instanceof Error ? error.message : "error" },
              "poll failed",
            );
          })
          .finally(() => {
            inFlight = null;
            if (options.once) {
              void stop();
              return;
            }
            scheduleNext();
          });
      })();
    }, pollIntervalMs);
  };

  const stop = async () => {
    stopping = true;
    running = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    try {
      if (inFlight) await inFlight;
    } catch {
      // ignore
    }
    try {
      if (db) {
        await upsertWorkerHeartbeat(db, {
          workerName,
          status: "stopped",
          details: { workerId },
        });
      }
    } catch {
      // ignore
    }
    if (ownDatabase) {
      await ownDatabase.close();
      ownDatabase = null;
      db = options.db ?? options.database?.db ?? null;
    }
    safeLog("info", { event: "worker_stopped", workerId }, "worker stopped");
  };

  const start = async () => {
    if (running) return;
    running = true;
    stopping = false;
    await getDb();
    await heartbeat();
    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, heartbeatIntervalMs);

    safeLog(
      "info",
      {
        event: "worker_started",
        workerId,
        workerName,
        pollIntervalMs,
        batchSize,
        maxAttempts,
        hasResendKey: Boolean(options.resendApiKey),
      },
      "email worker started",
    );

    inFlight = tick()
      .catch((error) => {
        safeLog(
          "error",
          { event: "poll_failed", err: error instanceof Error ? error.message : "error" },
          "poll failed",
        );
      })
      .finally(() => {
        inFlight = null;
        if (options.once) {
          void stop();
          return;
        }
        scheduleNext();
      });

    if (options.once) {
      // Wait for the first tick + stop to finish.
      while (inFlight) {
        await inFlight;
      }
      if (running || !stopping) {
        await stop();
      }
    }

    if (options.runForMs && options.runForMs > 0) {
      setTimeout(() => {
        void stop();
      }, options.runForMs);
    }
  };

  return {
    workerId,
    workerName,
    start,
    stop,
    isRunning: () => running && !stopping,
    tick,
  };
}
