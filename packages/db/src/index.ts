/**
 * Shared database package scaffold.
 * Schema, migrations, and client wiring land in later missions.
 */

export const dbPackageName = "@vygo/db" as const;

export type DbConnectionConfig = {
  databaseUrl: string;
};

export function assertDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required for database operations");
  }
  return databaseUrl;
}
