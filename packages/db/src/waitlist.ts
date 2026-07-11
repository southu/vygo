import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { WaitlistRequest } from "@vygo/validation";
import type { Db } from "./client.js";
import {
  emailOutbox,
  submissionIdempotency,
  waitlistEntries,
  type EmailOutboxJob,
  type WaitlistEntry,
} from "./schema.js";

export type WaitlistPersistInput = {
  application: WaitlistRequest;
  ipHash: string | null;
  userAgent: string | null;
  priorityScore: number;
  now?: Date;
};

export type WaitlistPersistResult = {
  entry: WaitlistEntry;
  created: boolean;
  outbox: EmailOutboxJob | null;
};

export type IdempotencyRecord = {
  idempotencyKey: string;
  requestHash: string;
  responseCode: number;
  responseBody: unknown;
  expiresAt: Date;
};

export type WaitlistRepositoryOptions = {
  /** When true, throw before lead insert (integration fault adapter). */
  faultLead?: boolean;
  /** When true, throw before outbox insert (integration fault adapter). */
  faultOutbox?: boolean;
};

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * Hash of material request fields for idempotency conflict detection.
 * Excludes turnstile token, honeypot, and form timing.
 */
export function hashWaitlistRequest(application: WaitlistRequest): string {
  const material = {
    fullName: application.fullName,
    email: application.email,
    companyName: application.companyName,
    role: application.role ?? null,
    productUrl: application.productUrl,
    prototypePlatform: application.prototypePlatform ?? null,
    stage: application.stage,
    primaryBlocker: application.primaryBlocker,
    desiredStartWindow: application.desiredStartWindow,
    budgetRange: application.budgetRange ?? null,
    commercialDeadline: application.commercialDeadline,
    message: application.message,
    privacyAccepted: application.privacyAccepted,
    marketingConsent: application.marketingConsent,
    utm: application.utm ?? {},
    landingPage: application.landingPage ?? null,
    referrer: application.referrer ?? null,
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export async function findIdempotency(db: Db, key: string): Promise<IdempotencyRecord | null> {
  const rows = await db
    .select()
    .from(submissionIdempotency)
    .where(eq(submissionIdempotency.idempotencyKey, key))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return {
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    responseCode: row.responseCode,
    responseBody: row.responseBody,
    expiresAt: row.expiresAt,
  };
}

export async function saveIdempotency(
  db: Db,
  record: {
    idempotencyKey: string;
    requestHash: string;
    responseCode: number;
    responseBody: unknown;
    ttlSeconds?: number;
  },
): Promise<void> {
  const ttl = record.ttlSeconds ?? 60 * 60 * 24;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await db
    .insert(submissionIdempotency)
    .values({
      idempotencyKey: record.idempotencyKey,
      requestHash: record.requestHash,
      responseCode: record.responseCode,
      responseBody: record.responseBody as Record<string, unknown>,
      expiresAt,
    })
    .onConflictDoNothing();
}

export async function findWaitlistByEmail(db: Db, email: string): Promise<WaitlistEntry | null> {
  const rows = await db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.email, email), isNull(waitlistEntries.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function countOutboxForEntry(db: Db, entryId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .where(eq(emailOutbox.waitlistEntryId, entryId));
  return Number(rows[0]?.c ?? 0);
}

/** Outbox rows for an entry (recipient redacted for inspection surfaces). */
export async function listOutboxForEntry(
  db: Db,
  entryId: string,
): Promise<
  Array<{
    id: string;
    kind: string;
    status: string;
    attemptCount: number;
    hasRecipient: boolean;
    recipientDomain: string | null;
    createdAt: Date;
    sentAt: Date | null;
  }>
> {
  const rows = await db
    .select({
      id: emailOutbox.id,
      kind: emailOutbox.kind,
      status: emailOutbox.status,
      attemptCount: emailOutbox.attemptCount,
      recipient: emailOutbox.recipient,
      createdAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.waitlistEntryId, entryId));

  return rows.map((row) => {
    const recipient = row.recipient ?? "";
    const at = recipient.indexOf("@");
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      attemptCount: row.attemptCount,
      hasRecipient: Boolean(recipient),
      recipientDomain: at >= 0 ? recipient.slice(at + 1) : null,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
    };
  });
}

/**
 * Atomically upsert a waitlist lead and create a confirmation outbox job for new leads.
 * On duplicate email: update mutable fields + last-seen; preserve first-seen and original UTMs.
 * Concurrent same-email writers are serialized with a transaction-scoped advisory lock.
 * Fault flags force failures for integration rollback tests (non-production only).
 */
export async function persistWaitlistIntake(
  db: Db,
  input: WaitlistPersistInput,
  options: WaitlistRepositoryOptions = {},
): Promise<WaitlistPersistResult> {
  const now = input.now ?? new Date();
  const app = input.application;
  const email = app.email;

  return await db.transaction(async (tx) => {
    // Serialize concurrent intakes for the same normalized email.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email}))`);

    if (options.faultLead) {
      throw new Error("FAULT_LEAD_PERSISTENCE");
    }

    const existingRows = await tx
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.email, email), isNull(waitlistEntries.deletedAt)))
      .limit(1);

    const existing = existingRows[0];

    if (existing) {
      const marketingConsentAt =
        app.marketingConsent && !existing.marketingConsent ? now : existing.marketingConsentAt;

      const [updated] = await tx
        .update(waitlistEntries)
        .set({
          fullName: app.fullName,
          companyName: app.companyName,
          role: nullIfEmpty(app.role ?? null),
          productUrl: app.productUrl,
          prototypePlatform: nullIfEmpty(app.prototypePlatform ?? null),
          stage: app.stage,
          primaryBlocker: app.primaryBlocker,
          desiredStart: app.desiredStartWindow,
          budgetRange: nullIfEmpty(app.budgetRange ?? null),
          commercialDeadline: app.commercialDeadline ?? false,
          message: app.message,
          privacyAccepted: true,
          privacyAcceptedAt: existing.privacyAcceptedAt,
          marketingConsent: app.marketingConsent ?? false,
          marketingConsentAt,
          ipHash: input.ipHash,
          userAgent: input.userAgent,
          landingPage: existing.landingPage ?? nullIfEmpty(app.landingPage ?? null),
          referrer: existing.referrer ?? nullIfEmpty(app.referrer ?? null),
          utmSource: existing.utmSource ?? nullIfEmpty(app.utm?.source ?? null),
          utmMedium: existing.utmMedium ?? nullIfEmpty(app.utm?.medium ?? null),
          utmCampaign: existing.utmCampaign ?? nullIfEmpty(app.utm?.campaign ?? null),
          utmContent: existing.utmContent ?? nullIfEmpty(app.utm?.content ?? null),
          utmTerm: existing.utmTerm ?? nullIfEmpty(app.utm?.term ?? null),
          priorityScore: input.priorityScore,
          submissionCount: existing.submissionCount + 1,
          lastSubmittedAt: now,
          updatedAt: now,
        })
        .where(eq(waitlistEntries.id, existing.id))
        .returning();

      return { entry: updated!, created: false, outbox: null };
    }

    const [inserted] = await tx
      .insert(waitlistEntries)
      .values({
        email,
        fullName: app.fullName,
        companyName: app.companyName,
        role: nullIfEmpty(app.role ?? null),
        productUrl: app.productUrl,
        prototypePlatform: nullIfEmpty(app.prototypePlatform ?? null),
        stage: app.stage,
        primaryBlocker: app.primaryBlocker,
        desiredStart: app.desiredStartWindow,
        budgetRange: nullIfEmpty(app.budgetRange ?? null),
        commercialDeadline: app.commercialDeadline ?? false,
        message: app.message,
        privacyAccepted: true,
        privacyAcceptedAt: now,
        marketingConsent: app.marketingConsent ?? false,
        marketingConsentAt: app.marketingConsent ? now : null,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
        landingPage: nullIfEmpty(app.landingPage ?? null),
        referrer: nullIfEmpty(app.referrer ?? null),
        utmSource: nullIfEmpty(app.utm?.source ?? null),
        utmMedium: nullIfEmpty(app.utm?.medium ?? null),
        utmCampaign: nullIfEmpty(app.utm?.campaign ?? null),
        utmContent: nullIfEmpty(app.utm?.content ?? null),
        utmTerm: nullIfEmpty(app.utm?.term ?? null),
        priorityScore: input.priorityScore,
        submissionCount: 1,
        lastSubmittedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const entry = inserted!;

    if (options.faultOutbox) {
      throw new Error("FAULT_OUTBOX_PERSISTENCE");
    }

    const outboxKey = `waitlist-confirmation:${entry.id}`;
    const [outboxRow] = await tx
      .insert(emailOutbox)
      .values({
        waitlistEntryId: entry.id,
        kind: "waitlist_confirmation",
        recipient: email,
        payload: {
          kind: "waitlist_confirmation",
          fullName: app.fullName,
          companyName: app.companyName,
        },
        idempotencyKey: outboxKey,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return { entry, created: true, outbox: outboxRow ?? null };
  });
}
