import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const availabilityStatusEnum = pgEnum("availability_status", ["open", "waitlist", "paused"]);

export const engagementTypeEnum = pgEnum("engagement_type", [
  "audit",
  "launch",
  "scale",
  "enterprise",
  "general",
]);

export const leadStageEnum = pgEnum("lead_stage", [
  "prototype",
  "private_beta",
  "live_users",
  "revenue",
  "enterprise_pipeline",
]);

export const leadBlockerEnum = pgEnum("lead_blocker", [
  "reliability_scale",
  "security",
  "security_compliance",
  "identity_access",
  "maintainability",
  "infrastructure",
  "data_migration",
  "other",
]);

export const desiredStartWindowEnum = pgEnum("desired_start_window", [
  "asap",
  "within_30_days",
  "within_60_days",
  "this_quarter",
  "later",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "qualified",
  "contacted",
  "scheduled",
  "waitlisted",
  "declined",
  "converted",
  "unsubscribed",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "dead_letter",
]);

/**
 * Singleton availability record. CHECK (id = 'main') + PK guarantees at most
 * one active row forever.
 */
export const siteAvailability = pgTable(
  "site_availability",
  {
    id: text("id").primaryKey().default("main"),
    status: availabilityStatusEnum("status").notNull().default("waitlist"),
    nextOpeningDate: date("next_opening_date"),
    engagementType: engagementTypeEnum("engagement_type").notNull().default("audit"),
    displayNote: text("display_note"),
    availableStarts: integer("available_starts"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("site_availability_singleton_id", sql`${table.id} = 'main'`),
    check(
      "site_availability_available_starts_nonneg",
      sql`${table.availableStarts} IS NULL OR ${table.availableStarts} >= 0`,
    ),
  ],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    companyName: text("company_name").notNull(),
    role: text("role"),
    productUrl: text("product_url").notNull(),
    prototypePlatform: text("prototype_platform"),
    stage: leadStageEnum("stage").notNull(),
    primaryBlocker: leadBlockerEnum("primary_blocker").notNull(),
    desiredStart: desiredStartWindowEnum("desired_start").notNull(),
    budgetRange: text("budget_range"),
    commercialDeadline: boolean("commercial_deadline").notNull().default(false),
    message: text("message").notNull(),
    status: leadStatusEnum("status").notNull().default("new"),
    priorityScore: integer("priority_score").notNull().default(0),
    privacyAccepted: boolean("privacy_accepted").notNull(),
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }).notNull(),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** Intake channel for the lead (e.g. "web" for the public marketing edge form). */
    source: text("source"),
    landingPage: text("landing_page"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    submissionCount: integer("submission_count").notNull().default(1),
    lastSubmittedAt: timestamp("last_submitted_at", { withTimezone: true }).notNull().defaultNow(),
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    internalNotificationSentAt: timestamp("internal_notification_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("waitlist_entries_email_uidx").on(table.email),
    index("waitlist_status_created_idx").on(table.status, table.createdAt),
    index("waitlist_priority_idx").on(table.priorityScore, table.createdAt),
  ],
);

export const submissionIdempotency = pgTable("submission_idempotency", {
  idempotencyKey: uuid("idempotency_key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  responseCode: integer("response_code").notNull(),
  responseBody: jsonb("response_body").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    waitlistEntryId: uuid("waitlist_entry_id").references(() => waitlistEntries.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_outbox_idempotency_uidx").on(table.idempotencyKey),
    index("email_outbox_poll_idx").on(table.status, table.nextAttemptAt),
  ],
);

/** Resend (and other provider) webhook events, stored idempotently. */
export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    recipient: text("recipient"),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("email_events_provider_event_uidx").on(table.providerEventId)],
);

/** Worker liveness heartbeats for composite /health readiness. */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerName: text("worker_name").primaryKey(),
  status: text("status").notNull().default("ready"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  details: jsonb("details").notNull().default({}),
});

/**
 * Lightweight apply-form submissions from the public /apply page.
 * Distinct from waitlist_entries (which powers the fuller waitlist intake).
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    workEmail: text("work_email").notNull(),
    productUrl: text("product_url"),
    message: text("message"),
    source: text("source").notNull().default("apply"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("applications_created_at_idx").on(table.createdAt),
    index("applications_work_email_idx").on(table.workEmail),
  ],
);

export type SiteAvailability = typeof siteAvailability.$inferSelect;
export type NewSiteAvailability = typeof siteAvailability.$inferInsert;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type EmailOutboxJob = typeof emailOutbox.$inferSelect;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type SubmissionIdempotency = typeof submissionIdempotency.$inferSelect;
export type WorkerHeartbeatRow = typeof workerHeartbeats.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

// ---------------------------------------------------------------------------
// Readiness Check (internal name: readiness)
// ---------------------------------------------------------------------------

/**
 * Resumable readiness session: stage + draft JSON keyed by a high-entropy token.
 * Clients never write Postgres directly; only the API mutates these rows.
 */
export const readinessSessions = pgTable(
  "readiness_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    stage: text("stage").notNull().default("intake"),
    draft: jsonb("draft").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("readiness_sessions_token_uidx").on(table.token),
    index("readiness_sessions_updated_at_idx").on(table.updatedAt),
  ],
);

/**
 * Stored readiness submissions. Raw pastes must be redacted before insert.
 * retention_expires_at encodes a 90-day retention intent (purge job may be a stub).
 */
export const readinessSubmissions = pgTable(
  "readiness_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => readinessSessions.id, {
      onDelete: "set null",
    }),
    parsedReport: jsonb("parsed_report").$type<Record<string, unknown> | null>(),
    rawPasteRedacted: text("raw_paste_redacted"),
    scores: jsonb("scores").$type<Record<string, unknown> | null>(),
    bucket: text("bucket"),
    discrepancyFlags: jsonb("discrepancy_flags").$type<unknown[]>().notNull().default([]),
    contact: jsonb("contact").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '90 days'`),
  },
  (table) => [
    index("readiness_submissions_session_id_idx").on(table.sessionId),
    index("readiness_submissions_retention_idx").on(table.retentionExpiresAt),
    index("readiness_submissions_created_at_idx").on(table.createdAt),
  ],
);

/** Versioned question prompts for the readiness flow (data-driven, not hardcoded). */
export const readinessQuestionBank = pgTable(
  "readiness_question_bank",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionKey: text("question_key").notNull(),
    prompt: text("prompt").notNull(),
    category: text("category").notNull().default("general"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("readiness_question_bank_key_uidx").on(table.questionKey),
    index("readiness_question_bank_category_idx").on(table.category, table.sortOrder),
  ],
);

/** Scoring rules/weights stored as data (seeded via migration). */
export const readinessScoringConfig = pgTable(
  "readiness_scoring_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configKey: text("config_key").notNull(),
    version: integer("version").notNull().default(1),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
    weights: jsonb("weights").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("readiness_scoring_config_key_version_uidx").on(table.configKey, table.version),
  ],
);

export type ReadinessSession = typeof readinessSessions.$inferSelect;
export type NewReadinessSession = typeof readinessSessions.$inferInsert;
export type ReadinessSubmission = typeof readinessSubmissions.$inferSelect;
export type NewReadinessSubmission = typeof readinessSubmissions.$inferInsert;
export type ReadinessQuestion = typeof readinessQuestionBank.$inferSelect;
export type ReadinessScoringConfigRow = typeof readinessScoringConfig.$inferSelect;
