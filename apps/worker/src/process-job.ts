import {
  markOutboxDeadLetter,
  markOutboxRetry,
  markOutboxSent,
  stampWaitlistEmailSent,
  computeRetryDelayMs,
  shouldDeadLetter,
  DEFAULT_MAX_ATTEMPTS,
  OUTBOX_KINDS,
  type Db,
  type OutboxClaimRow,
} from "@vygo/db";
import {
  EMAIL_KINDS,
  renderApplicantConfirmation,
  renderInternalLeadNotification,
  type ApplicantConfirmationPayload,
  type InternalLeadNotificationPayload,
} from "@vygo/email";
import type { EmailTransport } from "./transport.js";
import { safeLog } from "./redact.js";

export type ProcessJobOptions = {
  db: Db;
  transport: EmailTransport;
  from: string;
  maxAttempts?: number;
  now?: Date;
  /** Inject backoff RNG for tests. */
  random?: () => number;
  baseMs?: number;
  maxMs?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function renderForJob(
  job: OutboxClaimRow,
): Promise<{ subject: string; html: string; text: string }> {
  const payload = asRecord(job.payload);
  const kind = job.kind;

  if (
    kind === OUTBOX_KINDS.applicantConfirmation ||
    kind === OUTBOX_KINDS.waitlistConfirmation ||
    kind === EMAIL_KINDS.applicantConfirmation
  ) {
    const p: ApplicantConfirmationPayload = {
      fullName: String(payload.fullName ?? "there"),
      companyName: payload.companyName == null ? null : String(payload.companyName),
      message: payload.message == null ? null : String(payload.message),
    };
    const rendered = await renderApplicantConfirmation(p);
    return { subject: rendered.subject, html: rendered.html, text: rendered.text };
  }

  if (
    kind === OUTBOX_KINDS.internalLeadNotification ||
    kind === EMAIL_KINDS.internalLeadNotification
  ) {
    const p: InternalLeadNotificationPayload = {
      fullName: String(payload.fullName ?? "Unknown"),
      companyName: String(payload.companyName ?? "Unknown"),
      productUrl: String(payload.productUrl ?? ""),
      stage: String(payload.stage ?? ""),
      primaryBlocker: String(payload.primaryBlocker ?? ""),
      desiredStart: String(payload.desiredStart ?? ""),
      message: String(payload.message ?? ""),
      priorityScore: typeof payload.priorityScore === "number" ? payload.priorityScore : null,
      marketingConsent:
        typeof payload.marketingConsent === "boolean" ? payload.marketingConsent : null,
      applicationId: payload.applicationId == null ? null : String(payload.applicationId),
    };
    const rendered = await renderInternalLeadNotification(p);
    return { subject: rendered.subject, html: rendered.html, text: rendered.text };
  }

  // Unknown kind: still produce a minimal transactional shell so the job can complete or fail cleanly.
  const subject = `Vygo notification (${kind})`;
  const text = "Transactional notification.";
  const html = `<p>${text}</p>`;
  return { subject, html, text };
}

/**
 * Process a single claimed outbox job: render → send → mark sent | retry | dead-letter.
 * Never throws for expected delivery failures (records retry/dead-letter instead).
 */
export async function processOutboxJob(
  job: OutboxClaimRow,
  options: ProcessJobOptions,
): Promise<"sent" | "retry" | "dead_letter"> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = options.now ?? new Date();

  try {
    const rendered = await renderForJob(job);
    const result = await options.transport.send({
      to: job.recipient,
      from: options.from,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: job.idempotencyKey,
    });

    await markOutboxSent(options.db, job.id, {
      now,
      providerMessageId: result.providerMessageId,
    });

    if (job.waitlistEntryId) {
      await stampWaitlistEmailSent(options.db, job.waitlistEntryId, job.kind, now);
    }

    safeLog(
      "info",
      {
        event: "email_sent",
        jobId: job.id,
        kind: job.kind,
        attemptCount: job.attemptCount,
        providerIdempotencyKey: job.idempotencyKey,
        mock: Boolean(result.mock),
      },
      "email sent",
    );
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery_failed";
    // Never include raw error bodies that might hold recipient content.
    const safeError = message
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
      .slice(0, 300);

    if (shouldDeadLetter(job.attemptCount, maxAttempts)) {
      await markOutboxDeadLetter(options.db, job.id, { error: safeError, now });
      safeLog(
        "error",
        {
          event: "email_dead_letter",
          jobId: job.id,
          kind: job.kind,
          attemptCount: job.attemptCount,
          providerIdempotencyKey: job.idempotencyKey,
        },
        "email dead-lettered",
      );
      return "dead_letter";
    }

    const delayMs = computeRetryDelayMs(job.attemptCount, {
      random: options.random,
      baseMs: options.baseMs,
      maxMs: options.maxMs,
    });
    const nextAttemptAt = new Date(now.getTime() + delayMs);
    await markOutboxRetry(options.db, job.id, {
      nextAttemptAt,
      error: safeError,
      now,
    });
    safeLog(
      "warn",
      {
        event: "email_retry_scheduled",
        jobId: job.id,
        kind: job.kind,
        attemptCount: job.attemptCount,
        delayMs,
        providerIdempotencyKey: job.idempotencyKey,
      },
      "email retry scheduled",
    );
    return "retry";
  }
}
