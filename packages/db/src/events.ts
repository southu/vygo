import { eq, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { emailEvents, type EmailEvent } from "./schema.js";

export type PersistEmailEventInput = {
  providerEventId: string;
  eventType: string;
  recipient?: string | null;
  payload: Record<string, unknown>;
  receivedAt?: Date;
};

export type PersistEmailEventResult = {
  event: EmailEvent;
  created: boolean;
};

/**
 * Persist a provider webhook event idempotently by provider_event_id.
 * Concurrent inserts of the same id yield a single row.
 */
export async function persistEmailEvent(
  db: Db,
  input: PersistEmailEventInput,
): Promise<PersistEmailEventResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const inserted = await db
    .insert(emailEvents)
    .values({
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      recipient: input.recipient ?? null,
      payload: input.payload,
      receivedAt,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) {
    return { event: inserted[0], created: true };
  }

  const existing = await db
    .select()
    .from(emailEvents)
    .where(eq(emailEvents.providerEventId, input.providerEventId))
    .limit(1);
  const row = existing[0];
  if (!row) {
    // Extremely rare race: re-select via raw
    const rows = await db.execute(sql`
      SELECT id, provider_event_id, event_type, recipient, payload, received_at
      FROM email_events
      WHERE provider_event_id = ${input.providerEventId}
      LIMIT 1
    `);
    const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? [];
    const r = list[0];
    if (!r) {
      throw new Error("email event missing after conflict");
    }
    return {
      event: {
        id: String(r.id),
        providerEventId: String(r.provider_event_id),
        eventType: String(r.event_type),
        recipient: r.recipient == null ? null : String(r.recipient),
        payload: r.payload as Record<string, unknown>,
        receivedAt: new Date(String(r.received_at)),
      },
      created: false,
    };
  }
  return { event: row, created: false };
}

export async function countEmailEventsByProviderId(
  db: Db,
  providerEventId: string,
): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(emailEvents)
    .where(eq(emailEvents.providerEventId, providerEventId));
  return Number(rows[0]?.c ?? 0);
}

export async function findEmailEventByProviderId(
  db: Db,
  providerEventId: string,
): Promise<EmailEvent | null> {
  const rows = await db
    .select()
    .from(emailEvents)
    .where(eq(emailEvents.providerEventId, providerEventId))
    .limit(1);
  return rows[0] ?? null;
}

export type SafeEmailEventView = {
  id: string;
  providerEventId: string;
  eventType: string;
  hasRecipient: boolean;
  recipientDomain: string | null;
  receivedAt: string;
  /** Never includes raw payload secrets or applicant message bodies. */
  payloadKeys: string[];
};

export function toSafeEmailEventView(event: EmailEvent): SafeEmailEventView {
  const recipient = event.recipient ?? "";
  const at = recipient.indexOf("@");
  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : {};
  return {
    id: event.id,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    hasRecipient: Boolean(recipient),
    recipientDomain: at >= 0 ? recipient.slice(at + 1) : null,
    receivedAt: event.receivedAt.toISOString(),
    payloadKeys: Object.keys(payload).slice(0, 40),
  };
}
