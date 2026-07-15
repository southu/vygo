import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertDatabaseUrl } from "./assert.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
/** Checked-in SQL migrations live next to the package root. */
export const MIGRATIONS_FOLDER = join(packageDir, "..", "migrations");

/** Tags from migrations/meta/_journal.json that must be applied for readiness. */
export const REQUIRED_MIGRATION_TAGS = [
  "0000_init",
  "0001_email_worker",
  "0002_waitlist_source",
  "0003_seed_availability",
] as const;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const url = assertDatabaseUrl(databaseUrl);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Returns true when the Drizzle migrations table includes every required migration.
 * Drizzle stores content hashes (not tags); we require at least as many applied
 * migrations as required journal tags, and fail closed on any query error.
 */
export async function areRequiredMigrationsApplied(
  sql: postgres.Sql,
): Promise<{ ok: boolean; applied: string[]; missing: string[] }> {
  try {
    const rows = await sql<{ hash: string }[]>`
      SELECT hash
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at ASC
    `;

    const applied = rows.map((r) => String(r.hash));
    const requiredCount = REQUIRED_MIGRATION_TAGS.length;
    if (applied.length < requiredCount) {
      return {
        ok: false,
        applied,
        missing: [...REQUIRED_MIGRATION_TAGS].slice(applied.length),
      };
    }
    return { ok: true, applied, missing: [] };
  } catch {
    return { ok: false, applied: [], missing: [...REQUIRED_MIGRATION_TAGS] };
  }
}
