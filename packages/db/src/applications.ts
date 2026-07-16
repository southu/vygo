import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { applications, type Application, type NewApplication } from "./schema.js";

export type ApplicationInsertInput = {
  /** Optional fixed primary key (e.g. dual-write using waitlist entry id). */
  id?: string;
  fullName: string;
  workEmail: string;
  productUrl?: string | null;
  message?: string | null;
  source?: string;
};

export type ApplicationPublicRow = {
  id: string;
  full_name: string;
  work_email: string;
  product_url: string | null;
  message: string | null;
  source: string;
  created_at: string;
};

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export function toApplicationPublicRow(row: Application): ApplicationPublicRow {
  return {
    id: row.id,
    full_name: row.fullName,
    work_email: row.workEmail,
    product_url: row.productUrl ?? null,
    message: row.message ?? null,
    source: row.source,
    created_at: row.createdAt.toISOString(),
  };
}

/** Insert one application row and return the stored public representation. */
export async function insertApplication(
  db: Db,
  input: ApplicationInsertInput,
): Promise<ApplicationPublicRow> {
  const values: NewApplication = {
    fullName: input.fullName.trim(),
    // Preserve submitted casing (do not force lowercase) so exact-email SELECTs match.
    workEmail: input.workEmail.trim(),
    productUrl: nullIfEmpty(input.productUrl ?? null),
    message: nullIfEmpty(input.message ?? null),
    source: (input.source ?? "apply").trim() || "apply",
  };
  if (input.id) {
    values.id = input.id;
  }

  const [inserted] = await db.insert(applications).values(values).returning();
  if (!inserted) {
    throw new Error("application insert returned no row");
  }
  return toApplicationPublicRow(inserted);
}

export async function findApplicationById(
  db: Db,
  id: string,
): Promise<ApplicationPublicRow | null> {
  const rows = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return toApplicationPublicRow(row);
}
