/**
 * Typed access for Readiness Check sessions / submissions.
 * Raw pastes must be redacted before storage; submissions carry a 90-day
 * retention intent (retention_expires_at). The purge helper is intentionally
 * a documented stub until a scheduled job is wired.
 */
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import {
  readinessSessions,
  readinessSubmissions,
  type NewReadinessSession,
  type NewReadinessSubmission,
  type ReadinessSession,
  type ReadinessSubmission,
} from "./schema.js";

/** Public session view — never includes internal DB-only fields beyond the contract. */
export type ReadinessSessionPublic = {
  token: string;
  stage: string;
  draft: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateReadinessSessionInput = {
  stage?: string;
  draft?: Record<string, unknown>;
};

export type PatchReadinessSessionInput = {
  stage?: string;
  draft?: Record<string, unknown>;
};

export type InsertReadinessSubmissionInput = {
  sessionId?: string | null;
  parsedReport?: Record<string, unknown> | null;
  /** MUST already be redacted — use redactSensitivePaste before calling. */
  rawPasteRedacted?: string | null;
  scores?: Record<string, unknown> | null;
  bucket?: string | null;
  discrepancyFlags?: unknown[];
  contact?: Record<string, unknown> | null;
};

const DEFAULT_STAGE = "intake";
const TOKEN_BYTES = 24;

/** High-entropy, URL-safe resumable token (not a guessable sequential id). */
export function generateReadinessSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Redact connection strings, API keys, bearer tokens, and common secret shapes
 * from a raw paste BEFORE it is persisted. Never store unredacted pastes.
 */
export function redactSensitivePaste(raw: string): string {
  if (!raw) return raw;
  let out = raw;
  // URI-style connection strings
  out = out.replace(
    /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|rediss):\/\/)[^\s"'`]+/gi,
    "$1[REDACTED]",
  );
  // Env-style assignments
  out = out.replace(
    /\b(DATABASE_URL|POSTGRES_URL|REDIS_URL|MONGO_URL|CONNECTION_STRING)\s*[=:]\s*\S+/gi,
    "$1=[REDACTED]",
  );
  out = out.replace(
    /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[=:]\s*\S+/g,
    "$1=[REDACTED]",
  );
  out = out.replace(/\b(api[_-]?key|secret|password|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]");
  // Bearer / common vendor tokens
  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-+=/]+/gi, "Bearer [REDACTED]");
  out = out.replace(/\bsk_(?:live|test)_[A-Za-z0-9]+/g, "[REDACTED]");
  out = out.replace(/\bghp_[A-Za-z0-9]{20,}/g, "[REDACTED]");
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "[REDACTED]");
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]");
  return out;
}

export function toReadinessSessionPublic(row: ReadinessSession): ReadinessSessionPublic {
  const draft =
    row.draft && typeof row.draft === "object" && !Array.isArray(row.draft)
      ? (row.draft as Record<string, unknown>)
      : {};
  return {
    token: row.token,
    stage: row.stage,
    draft,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeStage(value: string | undefined): string {
  if (value == null) return DEFAULT_STAGE;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_STAGE;
  // Bound length so a malicious stage cannot bloat rows.
  return trimmed.slice(0, 64);
}

function normalizeDraft(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

/** Create a new session with a fresh resumable token. */
export async function createReadinessSession(
  db: Db,
  input: CreateReadinessSessionInput = {},
): Promise<ReadinessSessionPublic> {
  const values: NewReadinessSession = {
    token: generateReadinessSessionToken(),
    stage: normalizeStage(input.stage),
    draft: normalizeDraft(input.draft),
  };
  const [inserted] = await db.insert(readinessSessions).values(values).returning();
  if (!inserted) {
    throw new Error("readiness session insert returned no row");
  }
  return toReadinessSessionPublic(inserted);
}

export async function findReadinessSessionByToken(
  db: Db,
  token: string,
): Promise<ReadinessSessionPublic | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const rows = await db
    .select()
    .from(readinessSessions)
    .where(eq(readinessSessions.token, trimmed))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return toReadinessSessionPublic(row);
}

/** Patch stage and/or draft for an existing token. Returns null when not found. */
export async function patchReadinessSessionByToken(
  db: Db,
  token: string,
  input: PatchReadinessSessionInput,
): Promise<ReadinessSessionPublic | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const updates: Partial<NewReadinessSession> = {
    updatedAt: new Date(),
  };
  if (input.stage !== undefined) {
    updates.stage = normalizeStage(input.stage);
  }
  if (input.draft !== undefined) {
    updates.draft = normalizeDraft(input.draft);
  }

  const rows = await db
    .update(readinessSessions)
    .set(updates)
    .where(eq(readinessSessions.token, trimmed))
    .returning();
  const row = rows[0];
  if (!row) return null;
  return toReadinessSessionPublic(row);
}

/**
 * Insert a submission. Callers MUST pass already-redacted paste text
 * (use redactSensitivePaste). retention_expires_at defaults to +90 days in SQL.
 */
export async function insertReadinessSubmission(
  db: Db,
  input: InsertReadinessSubmissionInput,
): Promise<ReadinessSubmission> {
  const values: NewReadinessSubmission = {
    sessionId: input.sessionId ?? null,
    parsedReport: input.parsedReport ?? null,
    rawPasteRedacted: input.rawPasteRedacted ?? null,
    scores: input.scores ?? null,
    bucket: input.bucket ?? null,
    discrepancyFlags: input.discrepancyFlags ?? [],
    contact: input.contact ?? null,
  };
  const [inserted] = await db.insert(readinessSubmissions).values(values).returning();
  if (!inserted) {
    throw new Error("readiness submission insert returned no row");
  }
  return inserted;
}

/**
 * 90-day retention purge stub.
 * Documented intent: delete rows where retention_expires_at <= now().
 * Returns deleted count when enabled; currently a no-op stub so operators can
 * wire a scheduled worker without changing the public contract.
 */
export async function purgeExpiredReadinessSubmissions(
  _db: Db,
  options?: { dryRun?: boolean; enabled?: boolean },
): Promise<{ deleted: number; stub: boolean }> {
  if (!options?.enabled) {
    return { deleted: 0, stub: true };
  }
  // Real delete path (kept for when the scheduled job flips enabled:true).
  const result = await _db.execute(sql`
    DELETE FROM readiness_submissions
    WHERE retention_expires_at <= now()
  `);
  const deleted =
    typeof (result as { count?: number }).count === "number"
      ? (result as { count: number }).count
      : 0;
  return { deleted, stub: false };
}
