/**
 * Shared readiness-session helpers for the marketing edge (www.vygo.ai).
 * Prefer local DATABASE_URL when configured; otherwise proxy server-to-server
 * to the Railway Fastify API which owns Postgres. Never returns secrets.
 */
import type { Sql } from "postgres";
import { randomBytes } from "node:crypto";
import { resolveDatabaseUrl, resolveUpstreamApiOrigin } from "./store.js";

export type ReadinessSessionPublic = {
  token: string;
  stage: string;
  draft: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ReadinessHandlerResult = {
  status: number;
  body: Record<string, unknown>;
  logError?: unknown;
  /** Seconds for Retry-After when status is 429. */
  retryAfterSeconds?: number;
};

const DEFAULT_STAGE = "intake";
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidReadinessToken(token: string): boolean {
  return TOKEN_RE.test(token.trim());
}

export function generateReadinessToken(): string {
  return randomBytes(24).toString("base64url");
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function ensureReadinessTables(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS readiness_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      token text NOT NULL,
      stage text DEFAULT 'intake' NOT NULL,
      draft jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_sessions_token_uidx ON readiness_sessions (token)`;
    await sql`CREATE INDEX IF NOT EXISTS readiness_sessions_updated_at_idx ON readiness_sessions (updated_at)`;
  } catch {
    // ignore
  }
}

function rowToPublic(row: {
  token: string;
  stage: string;
  draft: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}): ReadinessSessionPublic {
  const draft =
    row.draft && typeof row.draft === "object" && !Array.isArray(row.draft)
      ? (row.draft as Record<string, unknown>)
      : {};
  return {
    token: String(row.token),
    stage: String(row.stage),
    draft,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createSessionRow(
  sql: Sql,
  input: { stage?: string; draft?: Record<string, unknown> },
): Promise<ReadinessSessionPublic> {
  await ensureReadinessTables(sql);
  const token = generateReadinessToken();
  const stage =
    typeof input.stage === "string" && input.stage.trim()
      ? input.stage.trim().slice(0, 64)
      : DEFAULT_STAGE;
  const draft = input.draft && typeof input.draft === "object" ? input.draft : {};
  const rows = await sql<
    {
      token: string;
      stage: string;
      draft: unknown;
      created_at: Date | string;
      updated_at: Date | string;
    }[]
  >`
    INSERT INTO readiness_sessions (token, stage, draft)
    VALUES (${token}, ${stage}, ${sql.json(draft as never)})
    RETURNING token, stage, draft, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw new Error("readiness session insert returned no row");
  return rowToPublic(row);
}

export async function findSessionRow(
  sql: Sql,
  token: string,
): Promise<ReadinessSessionPublic | null> {
  await ensureReadinessTables(sql);
  const rows = await sql<
    {
      token: string;
      stage: string;
      draft: unknown;
      created_at: Date | string;
      updated_at: Date | string;
    }[]
  >`
    SELECT token, stage, draft, created_at, updated_at
    FROM readiness_sessions
    WHERE token = ${token}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? rowToPublic(row) : null;
}

export async function patchSessionRow(
  sql: Sql,
  token: string,
  input: { stage?: string; draft?: Record<string, unknown> },
): Promise<ReadinessSessionPublic | null> {
  await ensureReadinessTables(sql);
  const existing = await findSessionRow(sql, token);
  if (!existing) return null;
  const stage =
    input.stage !== undefined ? (input.stage.trim() || DEFAULT_STAGE).slice(0, 64) : existing.stage;
  const draft = input.draft !== undefined ? input.draft : existing.draft;
  const rows = await sql<
    {
      token: string;
      stage: string;
      draft: unknown;
      created_at: Date | string;
      updated_at: Date | string;
    }[]
  >`
    UPDATE readiness_sessions
    SET stage = ${stage},
        draft = ${sql.json(draft as never)},
        updated_at = now()
    WHERE token = ${token}
    RETURNING token, stage, draft, created_at, updated_at
  `;
  const row = rows[0];
  return row ? rowToPublic(row) : null;
}

export function parseSessionBody(
  body: unknown,
):
  | { ok: true; stage?: string; draft?: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> } {
  if (body == null || body === "") return { ok: true };
  if (typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be a JSON object." } },
    };
  }
  const record = body as Record<string, unknown>;
  let stage: string | undefined;
  let draft: Record<string, unknown> | undefined;
  if (record.stage !== undefined) {
    if (typeof record.stage !== "string") {
      return {
        ok: false,
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: "stage must be a string." } },
      };
    }
    stage = record.stage;
  }
  if (record.draft !== undefined) {
    if (record.draft == null || typeof record.draft !== "object" || Array.isArray(record.draft)) {
      return {
        ok: false,
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: "draft must be a JSON object." } },
      };
    }
    draft = record.draft as Record<string, unknown>;
  }
  return { ok: true, stage, draft };
}

/**
 * Best-effort client IP for upstream rate limiting. Prefer real edge headers;
 * never invent addresses. Used only as an ephemeral hash input on Railway.
 */
export function resolveEdgeClientIp(
  headers?: Record<string, string | string[] | undefined>,
): string | null {
  if (!headers) return null;
  const pick = (name: string): string | null => {
    const raw = headers[name];
    if (typeof raw === "string" && raw.trim()) {
      const first = raw.split(",")[0]?.trim();
      return first || null;
    }
    if (Array.isArray(raw) && raw[0]) {
      const first = String(raw[0]).split(",")[0]?.trim();
      return first || null;
    }
    return null;
  };
  // Order: standard proxy chain, then platform-specific client IP headers.
  return (
    pick("x-forwarded-for") ||
    pick("x-real-ip") ||
    pick("x-vercel-forwarded-for") ||
    pick("cf-connecting-ip") ||
    pick("true-client-ip") ||
    null
  );
}

async function proxyJson(
  method: string,
  path: string,
  body: unknown | undefined,
  env: NodeJS.ProcessEnv,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  const origin = resolveUpstreamApiOrigin(env);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    // Forward client IP so Railway rate-limit buckets are per-client, not one
    // shared Vercel egress / "unknown" key that multi-tenant traffic poisons.
    const clientIp = resolveEdgeClientIp(inboundHeaders);
    if (clientIp) {
      headers["x-forwarded-for"] = clientIp;
      headers["x-real-ip"] = clientIp;
    }

    const upstream = await fetch(`${origin}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body ?? {}) : undefined,
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
    const retryHeader = upstream.headers.get("retry-after");
    const retryAfterSeconds =
      retryHeader && /^\d+$/.test(retryHeader.trim()) ? Number(retryHeader.trim()) : undefined;
    return {
      status: upstream.status,
      body: payload,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
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

export async function proxyCreateSession(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  return proxyJson("POST", "/v1/readiness/session", body ?? {}, env, inboundHeaders);
}

export async function proxyGetSession(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  return proxyJson(
    "GET",
    `/v1/readiness/session/${encodeURIComponent(token)}`,
    undefined,
    env,
    inboundHeaders,
  );
}

export async function proxyPatchSession(
  token: string,
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  return proxyJson(
    "PATCH",
    `/v1/readiness/session/${encodeURIComponent(token)}`,
    body ?? {},
    env,
    inboundHeaders,
  );
}

export async function proxyLogLead(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  return proxyJson("POST", "/v1/readiness/lead", body ?? {}, env, inboundHeaders);
}

export async function proxyEmailPrompt(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  return proxyJson("POST", "/v1/readiness/email-prompt", body ?? {}, env, inboundHeaders);
}

export async function proxyParsePaste(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  inboundHeaders?: Record<string, string | string[] | undefined>,
): Promise<ReadinessHandlerResult> {
  return proxyJson("POST", "/v1/readiness/parse", body ?? {}, env, inboundHeaders);
}

/** Lightweight lead log when edge has direct DB (no secrets in body). */
export async function logLeadRow(
  sql: Sql,
  input: {
    token?: string | null;
    reason: string;
    answers?: Record<string, unknown> | null;
    email?: string | null;
  },
): Promise<{ id: string; accepted: true }> {
  await ensureReadinessTables(sql);
  await sql`
    CREATE TABLE IF NOT EXISTS readiness_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      session_id uuid,
      parsed_report jsonb,
      raw_paste_redacted text,
      scores jsonb,
      bucket text,
      discrepancy_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
      contact jsonb,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      retention_expires_at timestamp with time zone DEFAULT (now() + interval '90 days') NOT NULL
    )
  `;

  let sessionId: string | null = null;
  const token = input.token?.trim() || null;
  if (token) {
    const sessions = await sql<{ id: string; draft: unknown }[]>`
      SELECT id, draft FROM readiness_sessions WHERE token = ${token} LIMIT 1
    `;
    const row = sessions[0];
    if (row) {
      sessionId = row.id;
      const draft =
        row.draft && typeof row.draft === "object" && !Array.isArray(row.draft)
          ? { ...(row.draft as Record<string, unknown>) }
          : {};
      draft.offRamp = { kind: input.reason, loggedAt: new Date().toISOString() };
      if (input.email?.trim()) {
        draft.email = input.email.trim().toLowerCase().slice(0, 254);
      }
      await sql`
        UPDATE readiness_sessions
        SET draft = ${sql.json(draft as never)}, updated_at = now()
        WHERE token = ${token}
      `;
    }
  }

  const contact: Record<string, unknown> = {
    source: "readiness_off_ramp",
    reason: input.reason.slice(0, 64),
    loggedAt: new Date().toISOString(),
  };
  if (input.email?.trim()) {
    contact.email = input.email.trim().toLowerCase().slice(0, 254);
  }
  const bucket = `off_ramp:${input.reason.slice(0, 48)}`;
  const answers = input.answers ?? null;
  const rows = await sql<{ id: string }[]>`
    INSERT INTO readiness_submissions (session_id, parsed_report, bucket, contact)
    VALUES (
      ${sessionId},
      ${answers ? sql.json(answers as never) : null},
      ${bucket},
      ${sql.json(contact as never)}
    )
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("readiness lead insert returned no id");
  return { id, accepted: true };
}

export { resolveDatabaseUrl };
