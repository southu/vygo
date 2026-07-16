/**
 * Shared apply-form validation + Postgres persistence for the marketing edge.
 * When no local DATABASE_URL is configured, the edge function proxies to the
 * Railway API (which has Postgres). Never returns connection strings or stacks.
 */
import type { Sql } from "postgres";
import { resolveDatabaseUrl, resolveUpstreamApiOrigin } from "./store.js";

export const APPLY_SOURCE = "apply";

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
  source: string = APPLY_SOURCE,
): Promise<ApplyPublicRow> {
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
      ${source}
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

export async function findApplicationRow(
  sql: Sql,
  id: string,
): Promise<ApplyPublicRow | null> {
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
