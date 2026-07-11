import type { Sql } from "postgres";
import { areRequiredMigrationsApplied } from "./migrate.js";

export type ReadinessResult =
  | {
      ready: true;
      service: string;
      database: "ok";
      migrations: "ok";
      appliedMigrations: string[];
    }
  | {
      ready: false;
      service: string;
      reason: string;
      database?: "ok" | "error";
      migrations?: "missing" | "error";
      missingMigrations?: string[];
    };

export async function checkDatabaseReadiness(
  sql: Sql,
  service = "vygo-api",
): Promise<ReadinessResult> {
  try {
    await sql`SELECT 1`;
  } catch {
    return {
      ready: false,
      service,
      reason: "PostgreSQL is not reachable",
      database: "error",
    };
  }

  const migrations = await areRequiredMigrationsApplied(sql);
  if (!migrations.ok) {
    return {
      ready: false,
      service,
      reason: "Required Drizzle migrations are not applied",
      database: "ok",
      migrations: "missing",
      missingMigrations: migrations.missing,
    };
  }

  // Schema smoke: required tables must exist.
  try {
    await sql`SELECT 1 FROM site_availability LIMIT 1`;
  } catch {
    return {
      ready: false,
      service,
      reason: "Required schema state is unavailable",
      database: "ok",
      migrations: "error",
    };
  }

  return {
    ready: true,
    service,
    database: "ok",
    migrations: "ok",
    appliedMigrations: migrations.applied,
  };
}
