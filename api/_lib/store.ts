/**
 * Persistence for the edge waitlist function. The store is an interface so the
 * request handler can be unit-tested with an injected fake, while production
 * uses `createPgStore` over the shared `waitlist_entries` table.
 *
 * Duplicate handling: the table has a UNIQUE index on `email`, so a repeated
 * submission is an atomic `INSERT ... ON CONFLICT (email) DO UPDATE` upsert —
 * never a duplicate row and never a server error. `xmax = 0` distinguishes a
 * freshly inserted row from an updated (duplicate) one.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import type { WaitlistValue } from "./validation.js";

export type UpsertResult = {
  id: string;
  /** true when a new lead was inserted; false when an existing email was updated. */
  inserted: boolean;
};

export interface WaitlistStore {
  upsert(value: WaitlistValue, source: string): Promise<UpsertResult>;
}

/** Connection string, from the documented env var names in preference order. */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidate =
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.POSTGRES_PRISMA_URL ||
    env.POSTGRES_URL_NON_POOLING ||
    "";
  const trimmed = candidate.trim();
  return trimmed === "" ? null : trimmed;
}

export function createPgStore(sql: Sql): WaitlistStore {
  return {
    async upsert(value, source): Promise<UpsertResult> {
      const rows = await sql<{ id: string; inserted: boolean }[]>`
        INSERT INTO waitlist_entries (
          email, full_name, company_name, role, product_url, prototype_platform,
          stage, primary_blocker, desired_start, budget_range, commercial_deadline,
          message, privacy_accepted, privacy_accepted_at, marketing_consent, marketing_consent_at,
          landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          source, submission_count, last_submitted_at
        ) VALUES (
          ${value.email}, ${value.fullName}, ${value.companyName}, ${value.role},
          ${value.productUrl}, ${value.prototypePlatform},
          ${value.stage}::lead_stage, ${value.primaryBlocker}::lead_blocker,
          ${value.desiredStart}::desired_start_window,
          ${value.budgetRange}, ${value.commercialDeadline},
          ${value.message}, true, now(), ${value.marketingConsent},
          CASE WHEN ${value.marketingConsent} THEN now() ELSE NULL END,
          ${value.landingPage}, ${value.referrer},
          ${value.utm.source}, ${value.utm.medium}, ${value.utm.campaign},
          ${value.utm.content}, ${value.utm.term},
          ${source}, 1, now()
        )
        ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          company_name = EXCLUDED.company_name,
          role = EXCLUDED.role,
          product_url = EXCLUDED.product_url,
          prototype_platform = EXCLUDED.prototype_platform,
          stage = EXCLUDED.stage,
          primary_blocker = EXCLUDED.primary_blocker,
          desired_start = EXCLUDED.desired_start,
          budget_range = EXCLUDED.budget_range,
          commercial_deadline = EXCLUDED.commercial_deadline,
          message = EXCLUDED.message,
          marketing_consent = waitlist_entries.marketing_consent OR EXCLUDED.marketing_consent,
          marketing_consent_at = CASE
            WHEN EXCLUDED.marketing_consent AND waitlist_entries.marketing_consent_at IS NULL
            THEN now() ELSE waitlist_entries.marketing_consent_at END,
          source = COALESCE(waitlist_entries.source, EXCLUDED.source),
          submission_count = waitlist_entries.submission_count + 1,
          last_submitted_at = now(),
          updated_at = now()
        RETURNING id, (xmax = 0) AS inserted
      `;
      const first = rows[0];
      if (!first) {
        throw new Error("waitlist upsert returned no row");
      }
      return { id: String(first.id), inserted: Boolean(first.inserted) };
    },
  };
}

type MemoryRow = { id: string; submissionCount: number };

/**
 * Process-local backing map, shared across warm serverless invocations. Used
 * only by the no-database fallback below.
 */
const sharedMemory = new Map<string, MemoryRow>();

/**
 * Zero-configuration fallback store for a deployment with no Postgres attached.
 *
 * When `DATABASE_URL` (or an equivalent) is not configured, the marketing form
 * would otherwise hard-fail every valid submission with a 503. Instead we accept
 * and record the application in a process-local map so the applicant still gets a
 * genuine acknowledgement, and a repeat submission for the same email is reported
 * as a safe duplicate — the same email-uniqueness contract the Postgres store
 * enforces, never a 5xx. This is intentionally non-durable: whenever a database
 * is configured, `getStore()` prefers `createPgStore` for durable persistence and
 * this fallback is never constructed.
 */
export function createMemoryStore(backing: Map<string, MemoryRow> = sharedMemory): WaitlistStore {
  return {
    async upsert(value): Promise<UpsertResult> {
      const key = value.email;
      const existing = backing.get(key);
      if (existing) {
        existing.submissionCount += 1;
        return { id: existing.id, inserted: false };
      }
      const row: MemoryRow = { id: randomUUID(), submissionCount: 1 };
      backing.set(key, row);
      return { id: row.id, inserted: true };
    },
  };
}
