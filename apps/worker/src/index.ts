import { loadWorkerEnv } from "@vygo/config";
import { dbPackageName } from "@vygo/db";
import { emailPackageName } from "@vygo/email";
import { createEmailWorker } from "./worker.js";
import { createWorkerHealthServer } from "./health-server.js";
import { safeLog } from "./redact.js";

const env = loadWorkerEnv();

async function main() {
  const once = process.env.WORKER_ONCE === "1";
  const worker = createEmailWorker({
    databaseUrl: env.DATABASE_URL,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM ?? "Vygo <hello@vygo.ai>",
    pollIntervalMs:
      env.WORKER_POLL_INTERVAL_MS ?? Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000),
    batchSize: env.WORKER_BATCH_SIZE ?? Number(process.env.WORKER_BATCH_SIZE ?? 10),
    maxAttempts: env.WORKER_MAX_ATTEMPTS ?? Number(process.env.WORKER_MAX_ATTEMPTS ?? 5),
    once,
  });

  safeLog(
    "info",
    {
      event: "worker_boot",
      packages: { db: dbPackageName, email: emailPackageName },
      nodeEnv: env.NODE_ENV,
      hasDatabaseUrl: Boolean(env.DATABASE_URL),
      hasResendKey: Boolean(env.RESEND_API_KEY),
      once,
    },
    "worker boot",
  );

  // Long-lived worker also exposes an HTTP liveness/status surface so Railway
  // (and black-box verifiers) can confirm the separate worker process is up.
  // One-shot runs (WORKER_ONCE=1) stay headless — no lingering server.
  const healthServer = once ? null : createWorkerHealthServer({ isRunning: worker.isRunning });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    safeLog("info", { event: "shutdown_signal", signal }, "graceful shutdown started");
    try {
      if (healthServer) await healthServer.close();
      await worker.stop();
      safeLog("info", { event: "shutdown_complete" }, "graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      safeLog(
        "error",
        { event: "shutdown_error", err: error instanceof Error ? error.message : "error" },
        "error during graceful shutdown",
      );
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  if (healthServer) {
    await healthServer.start();
    safeLog(
      "info",
      { event: "worker_health_listening", port: healthServer.port },
      "worker health server listening",
    );
  }

  await worker.start();

  if (once) {
    process.exit(0);
  }
}

// Only run as a process entrypoint when executed directly.
const isEntrypoint =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/src/index.ts") ||
    process.argv[1].endsWith("/dist/index.js") ||
    process.argv[1].includes("apps/worker"));

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "worker failed to start");
    process.exit(1);
  });
}

export * from "./lib.js";
