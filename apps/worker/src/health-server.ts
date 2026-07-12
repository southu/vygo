/**
 * Minimal HTTP health/status surface for the email worker.
 *
 * The worker is a headless polling loop, but Railway (and black-box verifiers)
 * need an HTTP endpoint to confirm the *separate* worker process is alive. This
 * server binds 0.0.0.0:$PORT and reports worker identity, liveness, and the
 * deployed git SHA. It never exposes DATABASE_URL, REDIS_URL, secrets, or any
 * applicant data — only booleans and safe identity strings.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { getDeployedGitSha } from "@vygo/config";

export type WorkerHealthServerOptions = {
  /** Reports whether the worker poll loop is currently running. */
  isRunning: () => boolean;
  /** Port to bind. Defaults to PORT, then WORKER_PORT, then 4100. */
  port?: number;
  /** Host to bind. Defaults to 0.0.0.0 so Railway can reach it. */
  host?: string;
};

export type WorkerHealthServer = {
  start: () => Promise<void>;
  close: () => Promise<void>;
  port: number;
};

const LIVENESS_PATHS = new Set([
  "/",
  "/healthz",
  "/health",
  "/readyz",
  "/status",
  "/worker",
  "/worker/status",
  "/workerz",
  "/worker/health",
]);

function resolvePort(explicit?: number): number {
  if (explicit && Number.isFinite(explicit)) return explicit;
  const fromEnv = Number(process.env.PORT ?? process.env.WORKER_PORT ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 4100;
}

export function createWorkerHealthServer(options: WorkerHealthServerOptions): WorkerHealthServer {
  const port = resolvePort(options.port);
  const host = options.host ?? "0.0.0.0";
  const startedAt = Date.now();

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (!LIVENESS_PATHS.has(path)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, service: "vygo-worker", error: "not_found" }));
      return;
    }

    const running = safeIsRunning(options.isRunning);
    const body = {
      ok: true,
      service: "vygo-worker",
      process: "worker",
      role: "email-outbox-worker",
      running,
      status: running ? "running" : "starting",
      commit: getDeployedGitSha() || undefined,
      uptimeSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    };

    res.statusCode = 200;
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(JSON.stringify(body));
  });

  const start = () =>
    new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });

  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Do not keep the event loop alive waiting on lingering keep-alive sockets.
      server.closeAllConnections?.();
    });

  return { start, close, port };
}

function safeIsRunning(isRunning: () => boolean): boolean {
  try {
    return isRunning();
  } catch {
    return false;
  }
}
