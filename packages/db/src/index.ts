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
  findWaitlistById,
  countOutboxForEntry,
  listOutboxForEntry,
  persistWaitlistIntake,
  type WaitlistPersistInput,
  type WaitlistPersistResult,
  type IdempotencyRecord,
  type WaitlistRepositoryOptions,
} from "./waitlist.js";
export {
  insertApplication,
  findApplicationById,
  toApplicationPublicRow,
  type ApplicationInsertInput,
  type ApplicationPublicRow,
} from "./applications.js";
export {
  generateReadinessSessionToken,
  redactSensitivePaste,
  redactSessionDraft,
  toReadinessSessionPublic,
  createReadinessSession,
  findReadinessSessionByToken,
  patchReadinessSessionByToken,
  insertReadinessSubmission,
  logReadinessLead,
  enqueueReadinessPromptEmail,
  enqueueReadinessSnapshotEmail,
  enqueueReadinessOpsBriefEmail,
  upsertReadinessBrief,
  findReadinessBriefBySubmissionId,
  listOpsReadinessSubmissions,
  getOpsReadinessSubmissionDetail,
  listReadinessOutboxJobs,
  purgeExpiredReadinessSubmissions,
  listReadinessQuestionBank,
  findLatestSubmissionBySessionToken,
  findReadinessSubmissionById,
  getActiveReadinessScoringConfig,
  seedReadinessScoringConfig,
  persistReadinessScore,
  appendSubmissionDiscrepancyFlags,
  seedReadinessFollowupQuestions,
  type ReadinessSessionPublic,
  type CreateReadinessSessionInput,
  type PatchReadinessSessionInput,
  type InsertReadinessSubmissionInput,
  type LogReadinessLeadInput,
  type EnqueueReadinessPromptEmailInput,
  type EnqueueReadinessSnapshotEmailInput,
  type EnqueueReadinessOpsBriefEmailInput,
  type ReadinessQuestionBankRow,
  type ReadinessSubmissionPublic,
  type ReadinessScoringConfigRowPublic,
  type PersistReadinessScoreInput,
  type ReadinessBriefPublic,
  type UpsertReadinessBriefInput,
  type ListOpsReadinessFilters,
  type OpsReadinessListRow,
  type OpsReadinessDetail,
} from "./readiness-sessions.js";
export {
  OUTBOX_KINDS,
  applicantConfirmationIdempotencyKey,
  internalLeadNotificationIdempotencyKey,
  readinessPromptIdempotencyKey,
  readinessSnapshotIdempotencyKey,
  readinessOpsBriefIdempotencyKey,
  claimOutboxJobs,
  markOutboxSent,
  markOutboxRetry,
  markOutboxDeadLetter,
  stampWaitlistEmailSent,
  toSafeOutboxJobView,
  type ClaimOutboxOptions,
  type OutboxClaimRow,
  type SafeOutboxJobView,
  type OutboxKind,
} from "./outbox.js";
export {
  persistEmailEvent,
  countEmailEventsByProviderId,
  findEmailEventByProviderId,
  toSafeEmailEventView,
  type PersistEmailEventInput,
  type PersistEmailEventResult,
  type SafeEmailEventView,
} from "./events.js";
export {
  upsertWorkerHeartbeat,
  getWorkerHeartbeat,
  isWorkerHeartbeatFresh,
  type WorkerHeartbeat,
} from "./heartbeat.js";
export {
  computeRetryDelayMs,
  retryDelayBoundsMs,
  shouldDeadLetter,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_BACKOFF_JITTER_RATIO,
  DEFAULT_MAX_ATTEMPTS,
  type BackoffOptions,
} from "./retry.js";
export {
  insertTestOutboxJobs,
  insertProcessingOutboxJob,
  getOutboxStatus,
} from "./test-helpers.js";
export * from "./schema.js";

export const dbPackageName = "@vygo/db" as const;

export type DbConnectionConfig = {
  databaseUrl: string;
};
