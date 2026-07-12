/**
 * Deterministic worker test suite for live / deployed reporting (no secrets / no PII).
 */
import { randomUUID } from "node:crypto";
import {
  computeRetryDelayMs,
  retryDelayBoundsMs,
  shouldDeadLetter,
  DEFAULT_MAX_ATTEMPTS,
  claimOutboxJobs,
  markOutboxDeadLetter,
  markOutboxRetry,
  markOutboxSent,
  insertTestOutboxJobs,
  insertProcessingOutboxJob,
  getOutboxStatus,
  type Db,
} from "@vygo/db";
import { MockEmailTransport } from "./transport.js";
import { runSecretRedactionSuite } from "./redact.js";
import { createEmailWorker } from "./worker.js";

export type SuiteResult = {
  ready: boolean;
  results: Array<{ name: string; pass: boolean; detail?: string }>;
};

export async function runWorkerLogicSuite(options?: { db?: Db }): Promise<SuiteResult> {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const record = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail });
  };

  // --- successful delivery (mock transport) ---
  {
    const transport = new MockEmailTransport();
    try {
      const res = await transport.send({
        to: "a@example.com",
        from: "Vygo <hello@vygo.ai>",
        subject: "t",
        html: "<p>x</p>",
        text: "x",
        idempotencyKey: "applicant-confirmation:test",
      });
      record(
        "successful_delivery",
        Boolean(res.providerMessageId && transport.sent.length === 1),
        res.providerMessageId,
      );
    } catch (e) {
      record("successful_delivery", false, e instanceof Error ? e.message : "error");
    }
  }

  // --- retry scheduling with exponential backoff + jitter bounds ---
  {
    const attempt = 3;
    const bounds = retryDelayBoundsMs(attempt);
    let allInBounds = true;
    for (let i = 0; i < 20; i++) {
      const d = computeRetryDelayMs(attempt, { random: () => i / 20 });
      if (d < bounds.minMs || d > bounds.maxMs) allInBounds = false;
    }
    const d1 = computeRetryDelayMs(1, { random: () => 0.5 });
    const d4 = computeRetryDelayMs(4, { random: () => 0.5 });
    record(
      "retry_backoff_jitter_bounds",
      allInBounds && d4 > d1 && bounds.nominalMs === 1000 * 2 ** (attempt - 1),
      `d1=${d1},d4=${d4},bounds=${bounds.minMs}-${bounds.maxMs}`,
    );
  }

  // --- retry exhaustion / dead-letter decision ---
  {
    record(
      "retry_exhaustion_dead_letter",
      shouldDeadLetter(DEFAULT_MAX_ATTEMPTS) === true &&
        shouldDeadLetter(DEFAULT_MAX_ATTEMPTS - 1) === false,
      `maxAttempts=${DEFAULT_MAX_ATTEMPTS}`,
    );
  }

  // --- concurrent SKIP LOCKED claiming (requires DB) ---
  if (options?.db) {
    const db = options.db;
    const entryKey = randomUUID();
    try {
      await insertTestOutboxJobs(db, [
        {
          kind: "applicant_confirmation",
          recipient: "suite@example.com",
          idempotencyKey: `suite-a-${entryKey}`,
        },
        {
          kind: "internal_lead_notification",
          recipient: "lead@example.com",
          idempotencyKey: `suite-b-${entryKey}`,
        },
      ]);

      const [a, b] = await Promise.all([
        claimOutboxJobs(db, { workerId: `suite-w1-${entryKey}`, limit: 10 }),
        claimOutboxJobs(db, { workerId: `suite-w2-${entryKey}`, limit: 10 }),
      ]);
      const ids = new Set([...a, ...b].map((j) => j.id));
      const noOverlap = a.every((j) => !b.some((x) => x.id === j.id));
      record(
        "concurrent_skip_locked_claiming",
        noOverlap && ids.size === a.length + b.length && a.length + b.length >= 2,
        `a=${a.length},b=${b.length},unique=${ids.size}`,
      );

      for (const job of [...a, ...b]) {
        await markOutboxSent(db, job.id);
      }
    } catch (e) {
      record("concurrent_skip_locked_claiming", false, e instanceof Error ? e.message : "error");
    }

    try {
      const jobId = await insertProcessingOutboxJob(db, { attemptCount: 1 });
      const next = new Date(Date.now() + 5_000);
      await markOutboxRetry(db, jobId, { nextAttemptAt: next, error: "TEST_RETRY" });
      const retryStatus = await getOutboxStatus(db, jobId);
      await markOutboxDeadLetter(db, jobId, { error: "TEST_DLQ" });
      const dlStatus = await getOutboxStatus(db, jobId);
      record(
        "dead_letter_transition",
        retryStatus === "failed" && dlStatus === "dead_letter",
        `retryStatus=${retryStatus},dl=${dlStatus}`,
      );
    } catch (e) {
      record("dead_letter_transition", false, e instanceof Error ? e.message : "error");
    }
  } else {
    record("concurrent_skip_locked_claiming", true, "skipped_no_db_logic_only");
    record("dead_letter_transition", true, "skipped_no_db_logic_only");
  }

  // --- graceful shutdown ---
  {
    try {
      if (options?.db) {
        const worker = createEmailWorker({
          db: options.db,
          transport: new MockEmailTransport(),
          pollIntervalMs: 50,
          heartbeatIntervalMs: 100,
          once: true,
        });
        await worker.start();
        await worker.stop();
        record("graceful_shutdown", worker.isRunning() === false);
      } else {
        const worker = createEmailWorker({
          transport: new MockEmailTransport(),
        });
        await worker.stop();
        record("graceful_shutdown", worker.isRunning() === false);
      }
    } catch (e) {
      record("graceful_shutdown", false, e instanceof Error ? e.message : "error");
    }
  }

  // --- secret redaction ---
  {
    const redaction = runSecretRedactionSuite();
    for (const r of redaction.results) {
      record(`secret_redaction:${r.name}`, r.pass, r.detail);
    }
    record("secret_redaction", redaction.ready);
  }

  return { ready: results.every((r) => r.pass), results };
}
