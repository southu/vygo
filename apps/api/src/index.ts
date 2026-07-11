import { loadApiEnv } from "@vygo/config";
import { buildApp } from "./app.js";

async function main() {
  const env = loadApiEnv();
  const { app, close } = await buildApp({ env });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "graceful shutdown started");
    try {
      await close();
      app.log.info("graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "error during graceful shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`vygo API listening at ${address}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "API failed to start");
  process.exit(1);
});
