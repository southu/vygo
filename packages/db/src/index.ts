/**
 * @vygo/db — Drizzle schema, migrations, and shared database client.
 */

export { assertDatabaseUrl } from "./assert.js";
export { createDatabase, type DatabaseHandle, type Db } from "./client.js";
export {
  MIGRATIONS_FOLDER,
  REQUIRED_MIGRATION_TAGS,
  runMigrations,
  areRequiredMigrationsApplied,
} from "./migrate.js";
export { checkDatabaseReadiness, type ReadinessResult } from "./readiness.js";
export {
  NEUTRAL_PUBLIC_AVAILABILITY,
  toPublicAvailability,
  computeAvailabilityEtag,
  getSiteAvailability,
  setSiteAvailability,
  seedLocalAvailability,
  type AvailabilitySetInput,
} from "./availability.js";
export {
  hashWaitlistRequest,
  findIdempotency,
  saveIdempotency,
  findWaitlistByEmail,
  countOutboxForEntry,
  persistWaitlistIntake,
  type WaitlistPersistInput,
  type WaitlistPersistResult,
  type IdempotencyRecord,
  type WaitlistRepositoryOptions,
} from "./waitlist.js";
export * from "./schema.js";

export const dbPackageName = "@vygo/db" as const;

export type DbConnectionConfig = {
  databaseUrl: string;
};
