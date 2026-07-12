import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./client.js";

/** Insert pending outbox jobs for SKIP LOCKED concurrency tests (no waitlist FK). */
export async function insertTestOutboxJobs(
  db: Db,
  jobs: Array<{ kind: string; recipient: string; idempotencyKey: string; payload?: unknown }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const job of jobs) {
    const id = randomUUID();
    ids.push(id);
    await db.execute(sql`
      INSERT INTO email_outbox (id, kind, recipient, payload, idempotency_key, status, next_attempt_at)
      VALUES (
        ${id}::uuid,
        ${job.kind},
        ${job.recipient},
        ${JSON.stringify(job.payload ?? { fullName: "Suite" })}::jsonb,
        ${job.idempotencyKey},
        'pending',
        NOW() - INTERVAL '1 second'
      )
    `);
  }
  return ids;
}

export async function insertProcessingOutboxJob(
  db: Db,
  options?: { attemptCount?: number },
): Promise<string> {
  const id = randomUUID();
  const attemptCount = options?.attemptCount ?? 1;
  await db.execute(sql`
    INSERT INTO email_outbox (id, kind, recipient, payload, idempotency_key, status, attempt_count, next_attempt_at)
    VALUES (
      ${id}::uuid,
      'applicant_confirmation',
      'retry@example.com',
      '{}'::jsonb,
      ${`suite-retry-${id}`},
      'processing',
      ${attemptCount},
      NOW()
    )
  `);
  return id;
}

export async function getOutboxStatus(db: Db, id: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT status FROM email_outbox WHERE id = ${id}::uuid LIMIT 1
  `);
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<{ status: string }> }).rows ?? []);
  const row = rows[0] as { status?: string } | undefined;
  return row?.status ?? null;
}
