/**
 * Public apply-form intake + read-back for the /apply page.
 * POST /api/apply — validate and insert one applications row.
 * GET  /api/apply/:id — return the stored row as JSON.
 *
 * The applications table is ensured on first use so a deploy works even when
 * the formal Drizzle migration has not yet been applied via pnpm db:migrate.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  findApplicationById,
  insertApplication,
  type DatabaseHandle,
} from "@vygo/db";
import { safeError } from "../errors.js";

const SOURCE = "apply";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
};

export function parseApplyBody(
  body: unknown,
): { ok: true; value: ParsedApplyBody } | { ok: false; status: number; error: ReturnType<typeof safeError> } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: safeError("BAD_REQUEST", "Request body must be a JSON object."),
    };
  }
  const record = body as Record<string, unknown>;

  const fullNameRaw =
    typeof record.full_name === "string"
      ? record.full_name
      : typeof record.fullName === "string"
        ? record.fullName
        : "";
  const workEmailRaw =
    typeof record.work_email === "string"
      ? record.work_email
      : typeof record.workEmail === "string"
        ? record.workEmail
        : typeof record.email === "string"
          ? record.email
          : "";
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
      const row = await insertApplication(dbHandle.db, {
        fullName: parsed.value.fullName,
        workEmail: parsed.value.workEmail,
        productUrl: parsed.value.productUrl,
        message: parsed.value.message,
        source: SOURCE,
      });
      return reply.status(201).send(row);
    } catch (error) {
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
