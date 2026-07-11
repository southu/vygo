/**
 * Repeatable local-development seed workflow.
 * Applies migrations (if needed) and upserts the singleton availability row.
 *
 * Usage:
 *   DATABASE_URL=postgresql://vygo:vygo@localhost:5432/vygo pnpm seed:local
 */
import {
  assertDatabaseUrl,
  createDatabase,
  runMigrations,
  seedLocalAvailability,
  toPublicAvailability,
} from "@vygo/db";

async function main() {
  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL);
  await runMigrations(databaseUrl);

  const handle = createDatabase(databaseUrl);
  try {
    const row = await seedLocalAvailability(handle.db);
    const publicView = toPublicAvailability(row);
    console.log(
      JSON.stringify(
        {
          ok: true,
          script: "seed-local",
          availability: publicView,
          message: "Local database migrated and availability seed applied.",
        },
        null,
        2,
      ),
    );
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "seed-local failed";
  console.error(JSON.stringify({ ok: false, script: "seed-local", error: message }));
  process.exit(1);
});
