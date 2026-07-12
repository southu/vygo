import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import type { EmailOutboxJob } from "./schema.js";

export const OUTBOX_KINDS = {
  applicantConfirmation: "applicant_confirmation",
  internalLeadNotification: "internal_lead_notification",
  /** Legacy kind from earlier waitlist mission; still deliverable. */
  waitlistConfirmation: "waitlist_confirmation",
} as const;

export type OutboxKind = (typeof OUTBOX_KINDS)[keyof typeof OUTBOX_KINDS];

/** Stable non-secret provider idempotency keys (unique per entry + kind). */
export function applicantConfirmationIdempotencyKey(entryId: string): string {
  return `applicant-confirmation:${entryId}`;
}

export function internalLeadNotificationIdempotencyKey(entryId: string): string {
  return `internal-lead-notification:${entryId}`;
}

export type ClaimOutboxOptions = {
  workerId: string;
  limit?: number;
  now?: Date;
  /** Stale processing lock age in ms before reclaim (default 5 minutes). */
  staleLockMs?: number;
};

export type OutboxClaimRow = {
  id: string;
  waitlistEntryId: string | null;
  kind: string;
  recipient: string;
  payload: unknown;
  idempotencyKey: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Claim due outbox jobs with SELECT ... FOR UPDATE SKIP LOCKED semantics.
 * Concurrent workers never claim the same row.
 */
export async function claimOutboxJobs(
  db: Db,
  options: ClaimOutboxOptions,
): Promise<OutboxClaimRow[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const workerId = options.workerId;
  const now = options.now ?? new Date();
  const staleLockMs = options.staleLockMs ?? 5 * 60 * 1000;
  const staleBefore = new Date(now.getTime() - staleLockMs);

  // Release stale processing locks back to pending so they can be reclaimed.
  await db.execute(sql`
    UPDATE email_outbox
    SET
      status = 'pending',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = ${now}
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < ${staleBefore}
  `);

  const result = await db.execute(sql`
    UPDATE email_outbox AS o
    SET
      status = 'processing',
      locked_at = ${now},
      locked_by = ${workerId},
      attempt_count = o.attempt_count + 1,
      updated_at = ${now}
    WHERE o.id IN (
      SELECT id
      FROM email_outbox
      WHERE status IN ('pending', 'failed')
        AND next_attempt_at <= ${now}
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      o.id,
      o.waitlist_entry_id,
      o.kind,
      o.recipient,
      o.payload,
      o.idempotency_key,
      o.status,
      o.attempt_count,
      o.next_attempt_at,
      o.locked_at,
      o.locked_by,
      o.last_error,
      o.sent_at,
      o.created_at,
      o.updated_at
  `);

  const rows = coerceRows(result);
  return rows.map(normalizeClaimRow);
}

function coerceRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  // postgres.js / drizzle RowList is array-like
  if (
    result &&
    typeof result === "object" &&
    typeof (result as { length?: number }).length === "number"
  ) {
    return Array.from(result as ArrayLike<Record<string, unknown>>);
  }
  return [];
}

function normalizeClaimRow(row: Record<string, unknown>): OutboxClaimRow {
  const waitlistEntryId = row.waitlistEntryId ?? row.waitlist_entry_id;
  const idempotencyKey = row.idempotencyKey ?? row.idempotency_key;
  const attemptCount = row.attemptCount ?? row.attempt_count;
  const nextAttemptAt = row.nextAttemptAt ?? row.next_attempt_at;
  const lockedAt = row.lockedAt ?? row.locked_at;
  const lockedBy = row.lockedBy ?? row.locked_by;
  const lastError = row.lastError ?? row.last_error;
  const sentAt = row.sentAt ?? row.sent_at;
  const createdAt = row.createdAt ?? row.created_at;
  const updatedAt = row.updatedAt ?? row.updated_at;

  return {
    id: String(row.id),
    waitlistEntryId: waitlistEntryId == null ? null : String(waitlistEntryId),
    kind: String(row.kind),
    recipient: String(row.recipient),
    payload: row.payload,
    idempotencyKey: String(idempotencyKey),
    status: String(row.status),
    attemptCount: Number(attemptCount ?? 0),
    nextAttemptAt: toDate(nextAttemptAt) ?? new Date(),
    lockedAt: toDate(lockedAt),
    lockedBy: lockedBy == null ? null : String(lockedBy),
    lastError: lastError == null ? null : String(lastError),
    sentAt: toDate(sentAt),
    createdAt: toDate(createdAt) ?? new Date(),
    updatedAt: toDate(updatedAt) ?? new Date(),
  };
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function markOutboxSent(
  db: Db,
  jobId: string,
  options?: { now?: Date; providerMessageId?: string | null },
): Promise<void> {
  const now = options?.now ?? new Date();
  await db.execute(sql`
    UPDATE email_outbox
    SET
      status = 'sent',
      sent_at = ${now},
      locked_at = NULL,
      locked_by = NULL,
      last_error = NULL,
      updated_at = ${now}
    WHERE id = ${jobId}
  `);

  // Best-effort stamp on waitlist entry when kind is known.
  if (options?.providerMessageId) {
    // provider message id is not stored on outbox schema; payload remains source of truth.
  }
}

export async function markOutboxRetry(
  db: Db,
  jobId: string,
  options: {
    nextAttemptAt: Date;
    error: string;
    now?: Date;
  },
): Promise<void> {
  const now = options.now ?? new Date();
  const err = options.error.slice(0, 500);
  await db.execute(sql`
    UPDATE email_outbox
    SET
      status = 'failed',
      next_attempt_at = ${options.nextAttemptAt},
      last_error = ${err},
      locked_at = NULL,
      locked_by = NULL,
      updated_at = ${now}
    WHERE id = ${jobId}
  `);
}

export async function markOutboxDeadLetter(
  db: Db,
  jobId: string,
  options: { error: string; now?: Date },
): Promise<void> {
  const now = options.now ?? new Date();
  const err = options.error.slice(0, 500);
  await db.execute(sql`
    UPDATE email_outbox
    SET
      status = 'dead_letter',
      last_error = ${err},
      locked_at = NULL,
      locked_by = NULL,
      updated_at = ${now}
    WHERE id = ${jobId}
  `);
}

export async function stampWaitlistEmailSent(
  db: Db,
  entryId: string,
  kind: string,
  now = new Date(),
): Promise<void> {
  if (kind === OUTBOX_KINDS.applicantConfirmation || kind === OUTBOX_KINDS.waitlistConfirmation) {
    await db.execute(sql`
      UPDATE waitlist_entries
      SET confirmation_sent_at = COALESCE(confirmation_sent_at, ${now}), updated_at = ${now}
      WHERE id = ${entryId}
    `);
  } else if (kind === OUTBOX_KINDS.internalLeadNotification) {
    await db.execute(sql`
      UPDATE waitlist_entries
      SET internal_notification_sent_at = COALESCE(internal_notification_sent_at, ${now}), updated_at = ${now}
      WHERE id = ${entryId}
    `);
  }
}

export type SafeOutboxJobView = {
  id: string;
  kind: string;
  status: string;
  attemptCount: number;
  /** Stable non-secret provider idempotency identifier. */
  providerIdempotencyKey: string;
  hasRecipient: boolean;
  recipientDomain: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
  isDeadLetter: boolean;
};

export function toSafeOutboxJobView(job: {
  id: string;
  kind: string;
  status: string;
  attemptCount: number;
  idempotencyKey: string;
  recipient?: string | null;
  nextAttemptAt?: Date | null;
  createdAt: Date;
  sentAt?: Date | null;
}): SafeOutboxJobView {
  const recipient = job.recipient ?? "";
  const at = recipient.indexOf("@");
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attemptCount: job.attemptCount,
    providerIdempotencyKey: job.idempotencyKey,
    hasRecipient: Boolean(recipient),
    recipientDomain: at >= 0 ? recipient.slice(at + 1) : null,
    nextAttemptAt: job.nextAttemptAt?.toISOString?.() ?? null,
    createdAt: job.createdAt.toISOString(),
    sentAt: job.sentAt?.toISOString?.() ?? null,
    isDeadLetter: job.status === "dead_letter",
  };
}

export type EmailOutboxJobRow = EmailOutboxJob;
