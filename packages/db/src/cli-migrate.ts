import { assertDatabaseUrl } from "./assert.js";
import { runMigrations } from "./migrate.js";

async function main() {
  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL);
  await runMigrations(databaseUrl);
  console.log(JSON.stringify({ ok: true, action: "migrate" }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Migration failed";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
