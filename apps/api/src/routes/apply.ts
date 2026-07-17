/**
 * Public apply-form intake + read-back for the /apply page.
 * POST /api/apply — validate and insert one applications row.
 * GET  /api/apply/:id — return the stored row as JSON.
 *
 * The applications table is ensured on first use so a deploy works even when
 * the formal Drizzle migration has not yet been applied via pnpm db:migrate.
 *
 * --- Guide-update email signups (same POST /api/apply intake) ---
 * Request JSON shape (discriminator + email; name/message optional):
 *   { "source": "guide_updates", "email": "user@example.com" }
 * Also accepts "work_email" (or camelCase workEmail) as the email field.
 * Optional: "full_name" / "fullName", "message".
 *
 * Duplicate policy: a repeat email for guide_updates inserts a NEW applications
 * row (source explicitly 'guide_updates') and still returns a friendly success —
 * never an "already signed up" error.
 *
 * Anti-bot: mirrors standard apply (no Turnstile on this route today).
 * Success for guide_updates is returned only after the row commits and never
 * echoes email or other PII.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { findApplicationById, insertApplication, type DatabaseHandle } from "@vygo/db";
import { safeError } from "../errors.js";

const SOURCE = "apply";
/** Explicit applications.source for guide-update opt-ins — never the 'apply' default. */
const GUIDE_UPDATES_SOURCE = "guide_updates";
const GUIDE_UPDATES_FULL_NAME = "Guide updates";
const GUIDE_UPDATES_DEFAULT_MESSAGE = "guide updates opt-in";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ApplyRouteDeps = {
  getDb: () => DatabaseHandle | null;
};

/** Plausible work email: non-empty local part, @, domain with a dot. */
export function isPlausibleWorkEmail(value: string): boolean {
  const email = value.trim();
  if (!email || email.length > 320) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return false;
  if (!domain.includes(".")) return false;
  // Reject host-only strings without a label.tld shape.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type ParsedApplyBody = {
  fullName: string;
  workEmail: string;
  productUrl: string | null;
  message: string | null;
  /** Explicit insert source — guide_updates never falls through to 'apply'. */
  source: string;
  isGuideUpdates: boolean;
};

function isGuideUpdatesSource(record: Record<string, unknown>): boolean {
  const raw = record.source;
  return typeof raw === "string" && raw.trim().toLowerCase() === GUIDE_UPDATES_SOURCE;
}

function extractEmailRaw(record: Record<string, unknown>): string {
  if (typeof record.work_email === "string") return record.work_email;
  if (typeof record.workEmail === "string") return record.workEmail;
  if (typeof record.email === "string") return record.email;
  return "";
}

function extractFullNameRaw(record: Record<string, unknown>): string {
  if (typeof record.full_name === "string") return record.full_name;
  if (typeof record.fullName === "string") return record.fullName;
  return "";
}

/** PII-free success body for guide_updates (no email, name, or secrets). */
export function guideUpdatesSuccessBody(): Record<string, unknown> {
  return {
    ok: true,
    accepted: true,
    message: "You're signed up for guide updates.",
  };
}

export function parseApplyBody(
  body: unknown,
):
  | { ok: true; value: ParsedApplyBody }
  | { ok: false; status: number; error: ReturnType<typeof safeError> } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: safeError("BAD_REQUEST", "Request body must be a JSON object."),
    };
  }
  const record = body as Record<string, unknown>;

  // --- guide_updates branch (same endpoint; lighter validation) ---
  if (isGuideUpdatesSource(record)) {
    const workEmailRaw = extractEmailRaw(record);
    // Normalize: trim + lowercase for durable storage in work_email.
    const workEmail = workEmailRaw.trim().toLowerCase();
    if (!workEmail) {
      return {
        ok: false,
        status: 400,
        error: safeError("VALIDATION_ERROR", "email is required."),
      };
    }
    if (!isPlausibleWorkEmail(workEmail)) {
      return {
        ok: false,
        status: 400,
        error: safeError(
          "VALIDATION_ERROR",
          "email must be a valid-looking address (include @ and a domain).",
        ),
      };
    }

    const fullNameRaw = extractFullNameRaw(record).trim();
    const messageRaw = typeof record.message === "string" ? record.message.trim() : "";

    return {
      ok: true,
      value: {
        fullName: fullNameRaw || GUIDE_UPDATES_FULL_NAME,
        workEmail,
        productUrl: null,
        message: messageRaw || GUIDE_UPDATES_DEFAULT_MESSAGE,
        source: GUIDE_UPDATES_SOURCE,
        isGuideUpdates: true,
      },
    };
  }

  // --- standard apply branch ---
  const fullNameRaw = extractFullNameRaw(record);
  const workEmailRaw = extractEmailRaw(record);
  const productUrlRaw =
    typeof record.product_url === "string"
      ? record.product_url
      : typeof record.productUrl === "string"
        ? record.productUrl
        : "";
  const messageRaw =
    typeof record.message === "string"
      ? record.message
      : typeof record.company_description === "string"
        ? record.company_description
        : "";

  const fullName = fullNameRaw.trim();
  const workEmail = workEmailRaw.trim();

  if (!fullName) {
    return {
      ok: false,
      status: 400,
      error: safeError("VALIDATION_ERROR", "full_name is required and must be non-empty."),
    };
  }
  if (!workEmail) {
    return {
      ok: false,
      status: 400,
      error: safeError("VALIDATION_ERROR", "work_email is required."),
    };
  }
  if (!isPlausibleWorkEmail(workEmail)) {
    return {
      ok: false,
      status: 400,
      error: safeError(
        "VALIDATION_ERROR",
        "work_email must be a valid-looking address (include @ and a domain).",
      ),
    };
  }

  return {
    ok: true,
    value: {
      fullName,
      // Preserve submitted casing for durable storage / exact-email E2E queries.
      workEmail,
      productUrl: productUrlRaw.trim() || null,
      message: messageRaw.trim() || null,
      source: SOURCE,
      isGuideUpdates: false,
    },
  };
}

/** Ensure the applications table exists (bootstrap when migrate has not run yet). */
export async function ensureApplicationsTable(dbHandle: DatabaseHandle): Promise<void> {
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      full_name text NOT NULL,
      work_email text NOT NULL,
      product_url text,
      message text,
      source text NOT NULL DEFAULT 'apply',
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  // Index creation is best-effort; table is the durability gate.
  try {
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS applications_created_at_idx ON applications (created_at)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS applications_work_email_idx ON applications (work_email)`;
  } catch {
    // ignore index races
  }
}

export function registerApplyRoutes(app: FastifyInstance, deps: ApplyRouteDeps): void {
  app.post("/api/apply", async (request, reply) => {
    const parsed = parseApplyBody(request.body);
    if (!parsed.ok) {
      return reply.status(parsed.status).send(parsed.error);
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureApplicationsTable(dbHandle);
      // source is set explicitly from parsed value (guide_updates never uses 'apply' default).
      // Validation already ran above — invalid emails never reach this insert.
      const row = await insertApplication(dbHandle.db, {
        fullName: parsed.value.fullName,
        workEmail: parsed.value.workEmail,
        productUrl: parsed.value.productUrl,
        message: parsed.value.message,
        source: parsed.value.source,
      });
      if (parsed.value.isGuideUpdates) {
        // Success only after commit; never echo email / PII for guide opt-ins.
        return reply.status(200).send(guideUpdatesSuccessBody());
      }
      return reply.status(201).send(row);
    } catch (error) {
      // Insert-again policy: unique/duplicate failures still look like success for guide_updates.
      const errMsg = error instanceof Error ? error.message : String(error);
      if (
        parsed.value.isGuideUpdates &&
        /23505|unique(?:\s+constraint)?|duplicate key|already exists/i.test(errMsg)
      ) {
        return reply.status(200).send(guideUpdatesSuccessBody());
      }
      request.log.error(
        { event: "apply_insert_failed" },
        error instanceof Error ? error.message : "apply insert failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.get("/api/apply/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id?: string };
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id || !UUID_RE.test(id)) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid application id."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureApplicationsTable(dbHandle);
      const row = await findApplicationById(dbHandle.db, id);
      if (!row) {
        return reply.status(404).send(safeError("NOT_FOUND", "Application not found."));
      }
      return reply.status(200).send(row);
    } catch (error) {
      request.log.error(
        { event: "apply_read_failed" },
        error instanceof Error ? error.message : "apply read failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });
}
