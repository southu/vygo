import { loadWorkerEnv } from "@vygo/config";
import { dbPackageName } from "@vygo/db";
import { emailPackageName } from "@vygo/email";

const env = loadWorkerEnv();

/**
 * Email / outbox worker scaffold.
 * Polling and Resend delivery land in later missions.
 */
function main() {
  const payload = {
    service: "vygo-worker",
    ready: true,
    packages: {
      db: dbPackageName,
      email: emailPackageName,
    },
    nodeEnv: env.NODE_ENV,
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    hasRedisUrl: Boolean(env.REDIS_URL),
    hasResendKey: Boolean(env.RESEND_API_KEY),
  };

  console.log(JSON.stringify(payload));

  // Keep process alive in production-like runs; exit quickly in test if requested.
  if (process.env.WORKER_ONCE === "1") {
    return;
  }

  setInterval(() => {
    // Placeholder heartbeat; replaced by outbox drain loop later.
  }, 60_000);
}

main();
