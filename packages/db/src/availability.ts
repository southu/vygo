import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PublicAvailability } from "@vygo/validation";
import {
  engagementTypeSchema,
  type EngagementType,
  type AvailabilityStatus,
} from "@vygo/validation";
import type { Db } from "./client.js";
import { siteAvailability, type SiteAvailability } from "./schema.js";

/** Documented neutral safe public payload — never implies scarcity. */
export const NEUTRAL_PUBLIC_AVAILABILITY: PublicAvailability = {
  status: "open",
  nextOpeningDate: null,
  engagementType: "general",
  displayNote: "Request current availability",
  availableStarts: null,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export type AvailabilitySetInput = {
  status: AvailabilityStatus;
  nextOpeningDate?: string | null;
  engagementType?: EngagementType;
  displayNote?: string | null;
  availableStarts?: number | null;
  updatedBy?: string | null;
};

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayUtcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function isStaleDate(nextOpeningDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!nextOpeningDate) return false;
  if (!isIsoDateOnly(nextOpeningDate)) return true;
  return nextOpeningDate < todayUtcDateString(now);
}

function toDateString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    // postgres date may already be YYYY-MM-DD
    if (isIsoDateOnly(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function toIsoTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
}

const ALLOWED_STATUS = new Set(["open", "waitlist", "paused"]);

/**
 * Map a DB row to the public contract. Stale or malformed rows degrade to the
 * neutral safe response (never waitlist/paused scarcity).
 */
export function toPublicAvailability(
  row: SiteAvailability | null | undefined,
  now: Date = new Date(),
): PublicAvailability {
  if (!row) {
    return { ...NEUTRAL_PUBLIC_AVAILABILITY };
  }

  const status = String(row.status);
  if (!ALLOWED_STATUS.has(status)) {
    return { ...NEUTRAL_PUBLIC_AVAILABILITY };
  }

  const engagementParsed = engagementTypeSchema.safeParse(row.engagementType);
  const engagementType = engagementParsed.success ? engagementParsed.data : "general";

  const nextOpeningDate = toDateString(row.nextOpeningDate);
  const updatedAt = toIsoTimestamp(row.updatedAt) ?? NEUTRAL_PUBLIC_AVAILABILITY.updatedAt;

  // Malformed availableStarts
  let availableStarts: number | null = null;
  if (row.availableStarts != null) {
    if (
      typeof row.availableStarts !== "number" ||
      !Number.isFinite(row.availableStarts) ||
      row.availableStarts < 0
    ) {
      return { ...NEUTRAL_PUBLIC_AVAILABILITY };
    }
    availableStarts = row.availableStarts;
  }

  if (isStaleDate(nextOpeningDate, now)) {
    // Documented neutral safe response — no waitlist/paused scarcity.
    return {
      status: "open",
      nextOpeningDate: null,
      engagementType: "general",
      displayNote: "Request current availability",
      availableStarts: null,
      updatedAt,
    };
  }

  return {
    status: status as AvailabilityStatus,
    nextOpeningDate,
    engagementType,
    displayNote: row.displayNote ?? null,
    availableStarts,
    updatedAt,
  };
}

export function computeAvailabilityEtag(publicPayload: PublicAvailability): string {
  const stable = JSON.stringify({
    status: publicPayload.status,
    nextOpeningDate: publicPayload.nextOpeningDate,
    engagementType: publicPayload.engagementType,
    displayNote: publicPayload.displayNote,
    availableStarts: publicPayload.availableStarts,
    updatedAt: publicPayload.updatedAt,
  });
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 32);
  return `"${hash}"`;
}

export async function getSiteAvailability(db: Db): Promise<SiteAvailability | null> {
  const rows = await db
    .select()
    .from(siteAvailability)
    .where(eq(siteAvailability.id, "main"))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Transactional singleton upsert. Always targets id='main'.
 */
export async function setSiteAvailability(
  db: Db,
  input: AvailabilitySetInput,
): Promise<SiteAvailability> {
  const now = new Date();
  const values = {
    id: "main" as const,
    status: input.status,
    nextOpeningDate: input.nextOpeningDate ?? null,
    engagementType: input.engagementType ?? "audit",
    displayNote: input.displayNote ?? null,
    availableStarts: input.availableStarts ?? null,
    updatedBy: input.updatedBy ?? null,
    updatedAt: now,
  };

  const rows = await db
    .insert(siteAvailability)
    .values({
      ...values,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: siteAvailability.id,
      set: {
        status: values.status,
        nextOpeningDate: values.nextOpeningDate,
        engagementType: values.engagementType,
        displayNote: values.displayNote,
        availableStarts: values.availableStarts,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to upsert site_availability singleton");
  }
  return row;
}

export async function seedLocalAvailability(db: Db): Promise<SiteAvailability> {
  // Default local seed: waitlist with a future opening date.
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 45);
  const nextOpeningDate = future.toISOString().slice(0, 10);

  return setSiteAvailability(db, {
    status: "waitlist",
    nextOpeningDate,
    engagementType: "audit",
    displayNote: "Senior-only pods. Limited concurrent engagements.",
    availableStarts: null,
    updatedBy: "seed-local",
  });
}
