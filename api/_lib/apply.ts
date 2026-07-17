/**
 * Shared apply-form validation + Postgres persistence for the marketing edge.
 * When no local DATABASE_URL is configured, the edge function proxies to the
 * Railway API (which has Postgres). Never returns connection strings or stacks.
 *
 * --- Guide-update email signups (same POST /api/apply intake) ---
 * Request JSON shape (discriminator + email; name/message optional):
 *   { "source": "guide_updates", "email": "user@example.com" }
 * Also accepts "work_email" (or camelCase workEmail) as the email field.
 * Optional: "full_name" / "fullName", "message".
 *
 * Duplicate policy: a repeat email for guide_updates inserts a NEW applications
 * row (source explicitly 'guide_updates') and still returns a friendly success —
 * never an "already signed up" error. No unique constraint is enforced here.
 *
 * Success for guide_updates is returned only after the applications row commits,
 * and the response never echoes email or other PII (unlike apply read-back).
 */
import type { Sql } from "postgres";
import { resolveDatabaseUrl, resolveUpstreamApiOrigin } from "./store.js";

export const APPLY_SOURCE = "apply";
/** Explicit applications.source value for guide-update opt-ins — never rely on DB default. */
export const GUIDE_UPDATES_SOURCE = "guide_updates";
export const GUIDE_UPDATES_FULL_NAME = "Guide updates";
export const GUIDE_UPDATES_DEFAULT_MESSAGE = "guide updates opt-in";

export type ApplyPublicRow = {
  id: string;
  full_name: string;
  work_email: string;
  product_url: string | null;
  message: string | null;
  source: string;
  created_at: string;
};

export type ApplyParsed = {
  fullName: string;
  workEmail: string;
  productUrl: string | null;
  message: string | null;
  /**
   * Stored on applications.source when provided. For guide_updates this is always
   * GUIDE_UPDATES_SOURCE (set explicitly at insert — never the 'apply' default).
   * Optional for callers that pass source as insertApplicationRow's third arg
   * (e.g. waitlist dual-write).
   */
  source?: string;
  isGuideUpdates?: boolean;
};

export type ApplyHandlerResult = {
  status: number;
  body: Record<string, unknown>;
  logError?: unknown;
};

/** Plausible work email: non-empty local, @, domain with a dot. */
export function isPlausibleWorkEmail(value: string): boolean {
  const email = value.trim();
  if (!email || email.length > 320) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return false;
  if (!domain.includes(".")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

/**
 * PII-free success body for guide_updates. Never includes email, name, or secrets.
 * Call only after the applications row has been committed.
 */
export function guideUpdatesSuccessBody(): Record<string, unknown> {
  return {
    ok: true,
    accepted: true,
    message: "You're signed up for guide updates.",
  };
}

export function parseApplyBody(
  body: unknown,
): { ok: true; value: ApplyParsed } | { ok: false; status: number; body: Record<string, unknown> } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be a JSON object." } },
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
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "email is required.",
          },
        },
      };
    }
    if (!isPlausibleWorkEmail(workEmail)) {
      return {
        ok: false,
        status: 400,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "email must be a valid-looking address (include @ and a domain).",
          },
        },
      };
    }

    const fullNameRaw = extractFullNameRaw(record).trim();
    const messageRaw =
      typeof record.message === "string" ? record.message.trim() : "";

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
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "full_name is required and must be non-empty.",
        },
      },
    };
  }
  if (!workEmail) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "work_email is required." } },
    };
  }
  if (!isPlausibleWorkEmail(workEmail)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "work_email must be a valid-looking address (include @ and a domain).",
        },
      },
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
      source: APPLY_SOURCE,
      isGuideUpdates: false,
    },
  };
}

export async function ensureApplicationsTable(sql: Sql): Promise<void> {
  await sql`
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
  try {
    await sql`CREATE INDEX IF NOT EXISTS applications_created_at_idx ON applications (created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS applications_work_email_idx ON applications (work_email)`;
  } catch {
    // ignore
  }
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function insertApplicationRow(
  sql: Sql,
  value: ApplyParsed,
  /**
   * Override source (e.g. waitlist dual-write). When omitted, uses value.source
   * so guide_updates never falls through to the 'apply' column default.
   */
  source?: string,
): Promise<ApplyPublicRow> {
  // Prefer explicit override, then parsed value.source, then apply default.
  const insertSource =
    (source && source.trim()) ||
    (value.source && value.source.trim()) ||
    APPLY_SOURCE;
  await ensureApplicationsTable(sql);
  const rows = await sql<
    {
      id: string;
      full_name: string;
      work_email: string;
      product_url: string | null;
      message: string | null;
      source: string;
      created_at: Date | string;
    }[]
  >`
    INSERT INTO applications (full_name, work_email, product_url, message, source)
    VALUES (
      ${value.fullName},
      ${value.workEmail},
      ${value.productUrl},
      ${value.message},
      ${insertSource}
    )
    RETURNING id, full_name, work_email, product_url, message, source, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("application insert returned no row");
  return {
    id: String(row.id),
    full_name: row.full_name,
    work_email: row.work_email,
    product_url: row.product_url ?? null,
    message: row.message ?? null,
    source: row.source,
    created_at: toIso(row.created_at),
  };
}

export async function findApplicationRow(sql: Sql, id: string): Promise<ApplyPublicRow | null> {
  await ensureApplicationsTable(sql);
  const rows = await sql<
    {
      id: string;
      full_name: string;
      work_email: string;
      product_url: string | null;
      message: string | null;
      source: string;
      created_at: Date | string;
    }[]
  >`
    SELECT id, full_name, work_email, product_url, message, source, created_at
    FROM applications
    WHERE id = ${id}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    full_name: row.full_name,
    work_email: row.work_email,
    product_url: row.product_url ?? null,
    message: row.message ?? null,
    source: row.source,
    created_at: toIso(row.created_at),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** Proxy POST to Railway API when the edge has no DATABASE_URL. */
export async function proxyApplyPost(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApplyHandlerResult> {
  const origin = resolveUpstreamApiOrigin(env);
  try {
    const upstream = await fetch(`${origin}/api/apply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    let payload: Record<string, unknown> = {};
    try {
      payload = (await upstream.json()) as Record<string, unknown>;
    } catch {
      payload = {
        error: {
          code: "UPSTREAM_ERROR",
          message: "Upstream returned a non-JSON response.",
        },
      };
    }
    return { status: upstream.status, body: payload };
  } catch (error) {
    return {
      status: 503,
      body: {
        error: {
          code: "UNAVAILABLE",
          message: "Service temporarily unavailable. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

/** Proxy GET to Railway API when the edge has no DATABASE_URL. */
export async function proxyApplyGet(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApplyHandlerResult> {
  const origin = resolveUpstreamApiOrigin(env);
  try {
    const upstream = await fetch(`${origin}/api/apply/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    let payload: Record<string, unknown> = {};
    try {
      payload = (await upstream.json()) as Record<string, unknown>;
    } catch {
      payload = {
        error: {
          code: "UPSTREAM_ERROR",
          message: "Upstream returned a non-JSON response.",
        },
      };
    }
    return { status: upstream.status, body: payload };
  } catch (error) {
    return {
      status: 503,
      body: {
        error: {
          code: "UNAVAILABLE",
          message: "Service temporarily unavailable. Please try again later.",
        },
      },
      logError: error,
    };
  }
}

export { resolveDatabaseUrl };
