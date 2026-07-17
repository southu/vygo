/**
 * Typed access for Readiness Check sessions / submissions.
 * Raw pastes must be redacted before storage; submissions carry a 90-day
 * retention intent (retention_expires_at). The purge helper is intentionally
 * a documented stub until a scheduled job is wired.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { redactPasteSecrets, stripNullBytes, stripNullBytesDeep } from "@vygo/validation";
import type { Db } from "./client.js";
import {
  OUTBOX_KINDS,
  readinessOpsBriefIdempotencyKey,
  readinessPromptIdempotencyKey,
  readinessSnapshotIdempotencyKey,
  toSafeOutboxJobView,
  type SafeOutboxJobView,
} from "./outbox.js";
import {
  emailOutbox,
  readinessBriefs,
  readinessQuestionBank,
  readinessScoringConfig,
  readinessSessions,
  readinessSubmissions,
  type NewReadinessSession,
  type NewReadinessSubmission,
  type ReadinessBrief,
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

/**
 * Redact credential-shaped paste fields before any draft is persisted.
 * Defense in depth: client also blocks secrets before submit.
 * Also strips U+0000 from all free-text leaves — Postgres text/jsonb rejects
 * null bytes, which otherwise surfaces as HTTP 500 INTERNAL_ERROR on PATCH.
 */
export function redactSessionDraft(draft: Record<string, unknown>): Record<string, unknown> {
  // Strip NULs first so nested free-text (summary, concerns, productDescription,
  // report.*, manualAnswers.*, stage1.*) never reaches the driver.
  const out = stripNullBytesDeep({ ...draft }) as Record<string, unknown>;
  for (const key of ["pasteText", "rawPasteRedacted"] as const) {
    const value = out[key];
    if (typeof value === "string" && value) {
      const r = redactPasteSecrets(value);
      out[key] = redactSensitivePaste(r.redacted);
    }
  }
  return out;
}

/** Create a new session with a fresh resumable token. */
export async function createReadinessSession(
  db: Db,
  input: CreateReadinessSessionInput = {},
): Promise<ReadinessSessionPublic> {
  const values: NewReadinessSession = {
    token: generateReadinessSessionToken(),
    stage: normalizeStage(input.stage),
    draft: redactSessionDraft(normalizeDraft(input.draft)),
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

/**
 * Shallow-merge session drafts so partial client PATCHes (paste debounce,
 * confirm, email) never wipe server-owned parse fields like `report`.
 * Nested `stage1` / `manualAnswers` objects are also merged key-wise.
 */
export function mergeReadinessDrafts(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const prev =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const next =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? { ...incoming }
      : {};

  const mergeNested = (key: string) => {
    const a =
      prev[key] && typeof prev[key] === "object" && !Array.isArray(prev[key])
        ? (prev[key] as Record<string, unknown>)
        : null;
    const b =
      next[key] && typeof next[key] === "object" && !Array.isArray(next[key])
        ? (next[key] as Record<string, unknown>)
        : null;
    if (a && b) {
      next[key] = { ...a, ...b };
    } else if (a && !b) {
      // keep prev when incoming omits the nested object entirely
      if (!(key in next)) next[key] = a;
    }
  };
  mergeNested("stage1");
  mergeNested("manualAnswers");
  mergeNested("followupAnswers");
  mergeNested("report");

  return { ...prev, ...next };
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
    // Merge with existing draft so partial client updates cannot drop report /
    // parse metadata produced by POST /v1/readiness/parse.
    const current = await findReadinessSessionByToken(db, trimmed);
    const existingDraft =
      current?.draft && typeof current.draft === "object" && !Array.isArray(current.draft)
        ? (current.draft as Record<string, unknown>)
        : {};
    const incoming = normalizeDraft(input.draft) as Record<string, unknown>;
    updates.draft = redactSessionDraft(mergeReadinessDrafts(existingDraft, incoming));
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

export type LogReadinessLeadInput = {
  /** Optional session token for correlation. */
  token?: string | null;
  reason: "not_built_yet" | "features_only" | string;
  answers?: Record<string, unknown> | null;
  email?: string | null;
};

/**
 * Persist an off-ramp / intake lead server-side (no secrets).
 * Uses readiness_submissions.contact + bucket; never stores raw secrets.
 */
export async function logReadinessLead(
  db: Db,
  input: LogReadinessLeadInput,
): Promise<{ id: string; accepted: true }> {
  let sessionId: string | null = null;
  const token = input.token?.trim() || null;
  if (token) {
    const rows = await db
      .select()
      .from(readinessSessions)
      .where(eq(readinessSessions.token, token))
      .limit(1);
    const row = rows[0];
    if (row) {
      sessionId = row.id;
      const draft =
        row.draft && typeof row.draft === "object" && !Array.isArray(row.draft)
          ? { ...(row.draft as Record<string, unknown>) }
          : {};
      draft.offRamp = {
        kind: input.reason,
        loggedAt: new Date().toISOString(),
      };
      if (input.email?.trim()) {
        draft.email = input.email.trim().toLowerCase().slice(0, 254);
      }
      await db
        .update(readinessSessions)
        .set({ draft, updatedAt: new Date() })
        .where(eq(readinessSessions.token, token));
    }
  }

  const email = input.email?.trim().toLowerCase().slice(0, 254) || null;
  const contact: Record<string, unknown> = {
    source: "readiness_off_ramp",
    reason: String(input.reason).slice(0, 64),
    loggedAt: new Date().toISOString(),
  };
  if (email) contact.email = email;

  const inserted = await insertReadinessSubmission(db, {
    sessionId,
    parsedReport: input.answers && typeof input.answers === "object" ? input.answers : null,
    bucket: `off_ramp:${String(input.reason).slice(0, 48)}`,
    contact,
  });
  return { id: inserted.id, accepted: true };
}

export type EnqueueReadinessPromptEmailInput = {
  email: string;
  token: string;
  prompt: string;
  resumeUrl: string;
};

/**
 * Queue a readiness diagnostic prompt email via the transactional outbox.
 * Worker delivers via Resend when configured; mock transport when RESEND_API_KEY is empty.
 */
export async function enqueueReadinessPromptEmail(
  db: Db,
  input: EnqueueReadinessPromptEmailInput,
): Promise<{ queued: true; idempotencyKey: string }> {
  const email = input.email.trim().toLowerCase();
  const token = input.token.trim();
  const prompt = input.prompt.slice(0, 50_000);
  const resumeUrl = input.resumeUrl.slice(0, 500);
  const idempotencyKey = readinessPromptIdempotencyKey(token, email);
  const now = new Date();

  // Capture email on the session draft for resume.
  const session = await findReadinessSessionByToken(db, token);
  if (session) {
    const draft = { ...session.draft, email };
    await patchReadinessSessionByToken(db, token, { draft });
  }

  await db
    .insert(emailOutbox)
    .values({
      waitlistEntryId: null,
      kind: OUTBOX_KINDS.readinessPrompt,
      recipient: email,
      payload: {
        kind: OUTBOX_KINDS.readinessPrompt,
        email,
        token,
        prompt,
        resumeUrl,
      },
      idempotencyKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return { queued: true, idempotencyKey };
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

/** Public question bank row for Stage 4 selection. */
export type ReadinessQuestionBankRow = {
  questionKey: string;
  prompt: string;
  category: string;
  sortOrder: number;
  active: boolean;
  metadata: Record<string, unknown>;
};

/** List active question bank rows ordered for presentation. */
export async function listReadinessQuestionBank(db: Db): Promise<ReadinessQuestionBankRow[]> {
  const rows = await db
    .select()
    .from(readinessQuestionBank)
    .where(eq(readinessQuestionBank.active, true));
  return rows
    .map((row) => ({
      questionKey: row.questionKey,
      prompt: row.prompt,
      category: row.category,
      sortOrder: row.sortOrder,
      active: row.active,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Test-scoped / token-scoped submission read-back.
 * Returns redacted paste + parsed report + internal discrepancy flags.
 * Never includes unredacted secrets (callers must have redacted before insert).
 */
export type ReadinessSubmissionPublic = {
  id: string;
  sessionToken: string | null;
  parsedReport: Record<string, unknown> | null;
  rawPasteRedacted: string | null;
  scores: Record<string, unknown> | null;
  discrepancyFlags: unknown[];
  bucket: string | null;
  contact: Record<string, unknown> | null;
  createdAt: string;
};

export type ReadinessScoringConfigRowPublic = {
  configKey: string;
  version: number;
  rules: Record<string, unknown>;
  weights: Record<string, unknown>;
  active: boolean;
};

export async function findLatestSubmissionBySessionToken(
  db: Db,
  token: string,
): Promise<ReadinessSubmissionPublic | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const sessions = await db
    .select()
    .from(readinessSessions)
    .where(eq(readinessSessions.token, trimmed))
    .limit(1);
  const session = sessions[0];
  if (!session) return null;

  const rows = await db
    .select()
    .from(readinessSubmissions)
    .where(eq(readinessSubmissions.sessionId, session.id))
    .orderBy(desc(readinessSubmissions.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) {
    // Fall back to draft-stored parse when submission row missing.
    const draft =
      session.draft && typeof session.draft === "object" && !Array.isArray(session.draft)
        ? (session.draft as Record<string, unknown>)
        : {};
    if (!draft.report && !draft.pasteText && !draft.rawPasteRedacted) return null;
    return {
      id: typeof draft.submissionId === "string" ? draft.submissionId : `draft:${session.id}`,
      sessionToken: session.token,
      parsedReport:
        draft.report && typeof draft.report === "object" && !Array.isArray(draft.report)
          ? (draft.report as Record<string, unknown>)
          : null,
      rawPasteRedacted:
        typeof draft.rawPasteRedacted === "string"
          ? draft.rawPasteRedacted
          : typeof draft.pasteText === "string"
            ? draft.pasteText
            : null,
      scores:
        draft.scores && typeof draft.scores === "object" && !Array.isArray(draft.scores)
          ? (draft.scores as Record<string, unknown>)
          : null,
      discrepancyFlags: Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [],
      bucket: typeof draft.bucket === "string" ? draft.bucket : null,
      contact:
        draft.contact && typeof draft.contact === "object" && !Array.isArray(draft.contact)
          ? (draft.contact as Record<string, unknown>)
          : null,
      createdAt: session.updatedAt.toISOString(),
    };
  }

  return {
    id: row.id,
    sessionToken: session.token,
    parsedReport:
      row.parsedReport && typeof row.parsedReport === "object"
        ? (row.parsedReport as Record<string, unknown>)
        : null,
    rawPasteRedacted: row.rawPasteRedacted,
    scores:
      row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)
        ? (row.scores as Record<string, unknown>)
        : null,
    discrepancyFlags: Array.isArray(row.discrepancyFlags) ? row.discrepancyFlags : [],
    bucket: row.bucket,
    contact:
      row.contact && typeof row.contact === "object" && !Array.isArray(row.contact)
        ? (row.contact as Record<string, unknown>)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Load a submission by public snapshot id (UUID). */
export async function findReadinessSubmissionById(
  db: Db,
  id: string,
): Promise<ReadinessSubmissionPublic | null> {
  const trimmed = id.trim();
  if (!trimmed || trimmed.startsWith("draft:")) return null;

  const rows = await db
    .select()
    .from(readinessSubmissions)
    .where(eq(readinessSubmissions.id, trimmed))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  let sessionToken: string | null = null;
  if (row.sessionId) {
    const sessions = await db
      .select()
      .from(readinessSessions)
      .where(eq(readinessSessions.id, row.sessionId))
      .limit(1);
    sessionToken = sessions[0]?.token ?? null;
  }

  return {
    id: row.id,
    sessionToken,
    parsedReport:
      row.parsedReport && typeof row.parsedReport === "object"
        ? (row.parsedReport as Record<string, unknown>)
        : null,
    rawPasteRedacted: row.rawPasteRedacted,
    scores:
      row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)
        ? (row.scores as Record<string, unknown>)
        : null,
    discrepancyFlags: Array.isArray(row.discrepancyFlags) ? row.discrepancyFlags : [],
    bucket: row.bucket,
    contact:
      row.contact && typeof row.contact === "object" && !Array.isArray(row.contact)
        ? (row.contact as Record<string, unknown>)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Active scoring config (highest version wins). */
export async function getActiveReadinessScoringConfig(
  db: Db,
  configKey = "default",
): Promise<ReadinessScoringConfigRowPublic | null> {
  const rows = await db
    .select()
    .from(readinessScoringConfig)
    .where(
      and(eq(readinessScoringConfig.configKey, configKey), eq(readinessScoringConfig.active, true)),
    )
    .orderBy(desc(readinessScoringConfig.version))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    configKey: row.configKey,
    version: row.version,
    rules:
      row.rules && typeof row.rules === "object" && !Array.isArray(row.rules)
        ? (row.rules as Record<string, unknown>)
        : {},
    weights:
      row.weights && typeof row.weights === "object" && !Array.isArray(row.weights)
        ? (row.weights as Record<string, unknown>)
        : {},
    active: row.active,
  };
}

/** Idempotent seed of scoring config v2 from provided rules/weights JSON. */
export async function seedReadinessScoringConfig(
  db: Db,
  input: {
    configKey?: string;
    version?: number;
    rules: Record<string, unknown>;
    weights: Record<string, unknown>;
  },
): Promise<void> {
  const configKey = input.configKey ?? "default";
  const version = input.version ?? 2;
  const existing = await db
    .select({ id: readinessScoringConfig.id })
    .from(readinessScoringConfig)
    .where(
      and(
        eq(readinessScoringConfig.configKey, configKey),
        eq(readinessScoringConfig.version, version),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(readinessScoringConfig)
      .set({
        rules: input.rules,
        weights: input.weights,
        active: true,
      })
      .where(eq(readinessScoringConfig.id, existing[0].id));
    return;
  }
  await db.insert(readinessScoringConfig).values({
    configKey,
    version,
    rules: input.rules,
    weights: input.weights,
    active: true,
  });
}

export type PersistReadinessScoreInput = {
  token: string;
  scores: Record<string, unknown>;
  bucket: string;
  contact: Record<string, unknown>;
  /** Already-redacted report / paste fields. */
  parsedReport?: Record<string, unknown> | null;
  rawPasteRedacted?: string | null;
  discrepancyFlags?: unknown[];
};

/**
 * Persist score + bucket + contact on the latest submission (or insert one).
 * Mirrors scores into session draft for resume. Returns the submission id.
 */
export async function persistReadinessScore(
  db: Db,
  input: PersistReadinessScoreInput,
): Promise<ReadinessSubmissionPublic> {
  const trimmed = input.token.trim();
  const sessions = await db
    .select()
    .from(readinessSessions)
    .where(eq(readinessSessions.token, trimmed))
    .limit(1);
  const session = sessions[0];
  if (!session) {
    throw new Error("readiness session not found");
  }

  // Postgres-safe: strip U+0000 from free-text in scores/report/contact/draft.
  const safeScores = stripNullBytesDeep(input.scores) as Record<string, unknown>;
  const safeContact = stripNullBytesDeep(input.contact) as Record<string, unknown>;
  const safeReport = input.parsedReport
    ? (stripNullBytesDeep(input.parsedReport) as Record<string, unknown>)
    : null;
  const safePaste =
    typeof input.rawPasteRedacted === "string"
      ? stripNullBytes(input.rawPasteRedacted)
      : input.rawPasteRedacted;

  const draft =
    session.draft && typeof session.draft === "object" && !Array.isArray(session.draft)
      ? (stripNullBytesDeep({ ...(session.draft as Record<string, unknown>) }) as Record<
          string,
          unknown
        >)
      : {};
  draft.scores = safeScores;
  draft.bucket = input.bucket;
  draft.contact = safeContact;
  draft.scoredAt = new Date().toISOString();
  if (safeReport) draft.report = safeReport;
  if (safePaste) {
    draft.rawPasteRedacted = safePaste;
    draft.pasteText = safePaste;
  }

  await db
    .update(readinessSessions)
    .set({ draft, stage: "scored", updatedAt: new Date() })
    .where(eq(readinessSessions.token, trimmed));

  const existing = await findLatestSubmissionBySessionToken(db, trimmed);
  if (existing && !String(existing.id).startsWith("draft:")) {
    await db
      .update(readinessSubmissions)
      .set({
        scores: safeScores,
        bucket: input.bucket,
        contact: safeContact,
        parsedReport: safeReport ?? existing.parsedReport,
        rawPasteRedacted: safePaste ?? existing.rawPasteRedacted,
        discrepancyFlags: input.discrepancyFlags ?? existing.discrepancyFlags,
      })
      .where(eq(readinessSubmissions.id, existing.id));
    const updated = await findReadinessSubmissionById(db, existing.id);
    if (updated) {
      draft.submissionId = updated.id;
      await db
        .update(readinessSessions)
        .set({ draft, updatedAt: new Date() })
        .where(eq(readinessSessions.token, trimmed));
      return updated;
    }
  }

  const inserted = await insertReadinessSubmission(db, {
    sessionId: session.id,
    parsedReport:
      safeReport ??
      (draft.report && typeof draft.report === "object"
        ? (draft.report as Record<string, unknown>)
        : null),
    rawPasteRedacted:
      safePaste ??
      (typeof draft.rawPasteRedacted === "string"
        ? draft.rawPasteRedacted
        : typeof draft.pasteText === "string"
          ? draft.pasteText
          : null),
    scores: safeScores,
    bucket: input.bucket,
    discrepancyFlags: input.discrepancyFlags ?? [],
    contact: safeContact,
  });

  draft.submissionId = inserted.id;
  await db
    .update(readinessSessions)
    .set({ draft, updatedAt: new Date() })
    .where(eq(readinessSessions.token, trimmed));

  return {
    id: inserted.id,
    sessionToken: session.token,
    parsedReport:
      inserted.parsedReport && typeof inserted.parsedReport === "object"
        ? (inserted.parsedReport as Record<string, unknown>)
        : null,
    rawPasteRedacted: inserted.rawPasteRedacted,
    scores:
      inserted.scores && typeof inserted.scores === "object"
        ? (inserted.scores as Record<string, unknown>)
        : null,
    discrepancyFlags: Array.isArray(inserted.discrepancyFlags) ? inserted.discrepancyFlags : [],
    bucket: inserted.bucket,
    contact:
      inserted.contact && typeof inserted.contact === "object"
        ? (inserted.contact as Record<string, unknown>)
        : null,
    createdAt: inserted.createdAt.toISOString(),
  };
}

export type EnqueueReadinessSnapshotEmailInput = {
  snapshotId: string;
  email: string;
  snapshotUrl: string;
  /** Pre-rendered HTML/text optional; worker may rebuild from payload. */
  subject?: string;
  html?: string;
  text?: string;
  bucket?: string | null;
  name?: string | null;
};

/** Queue a readiness snapshot email (accept even if delivery is deferred). */
export async function enqueueReadinessSnapshotEmail(
  db: Db,
  input: EnqueueReadinessSnapshotEmailInput,
): Promise<{ queued: true; idempotencyKey: string }> {
  const email = input.email.trim().toLowerCase();
  const snapshotId = input.snapshotId.trim();
  const idempotencyKey = readinessSnapshotIdempotencyKey(snapshotId, email);
  const now = new Date();

  await db
    .insert(emailOutbox)
    .values({
      waitlistEntryId: null,
      kind: OUTBOX_KINDS.readinessSnapshot,
      recipient: email,
      payload: {
        kind: OUTBOX_KINDS.readinessSnapshot,
        email,
        snapshotId,
        snapshotUrl: input.snapshotUrl.slice(0, 500),
        subject: input.subject ?? "Your vygo readiness snapshot",
        html: input.html ?? null,
        text: input.text ?? null,
        bucket: input.bucket ?? null,
        name: input.name ?? null,
      },
      idempotencyKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return { queued: true, idempotencyKey };
}

export type EnqueueReadinessOpsBriefEmailInput = {
  submissionId: string;
  briefId: string;
  recipient: string;
  /** Safe structured brief payload for the worker (no secrets). */
  brief: Record<string, unknown>;
  subject?: string;
  html?: string;
  text?: string;
};

/** Queue internal ops lead-brief email for a completed readiness submission. */
export async function enqueueReadinessOpsBriefEmail(
  db: Db,
  input: EnqueueReadinessOpsBriefEmailInput,
): Promise<{ queued: true; idempotencyKey: string }> {
  const recipient = input.recipient.trim().toLowerCase();
  const submissionId = input.submissionId.trim();
  const briefId = input.briefId.trim();
  const idempotencyKey = readinessOpsBriefIdempotencyKey(submissionId, recipient);
  const now = new Date();

  await db
    .insert(emailOutbox)
    .values({
      waitlistEntryId: null,
      kind: OUTBOX_KINDS.readinessOpsBrief,
      recipient,
      payload: {
        kind: OUTBOX_KINDS.readinessOpsBrief,
        submissionId,
        briefId,
        // Structured brief for worker render — never include API keys / RESEND_*.
        brief: input.brief,
        subject: input.subject ?? null,
        html: input.html ?? null,
        text: input.text ?? null,
      },
      idempotencyKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return { queued: true, idempotencyKey };
}

export type ReadinessBriefPublic = {
  id: string;
  submissionId: string;
  brief: Record<string, unknown>;
  talkingPoints: string[];
  scoreSummary: Record<string, unknown> | null;
  bucket: string | null;
  discrepancyFlags: unknown[];
  llmPolished: boolean;
  createdAt: string;
};

export type UpsertReadinessBriefInput = {
  submissionId: string;
  brief: Record<string, unknown>;
  talkingPoints: string[];
  scoreSummary?: Record<string, unknown> | null;
  bucket?: string | null;
  discrepancyFlags?: unknown[];
  llmPolished?: boolean;
};

function toBriefPublic(row: ReadinessBrief): ReadinessBriefPublic {
  return {
    id: row.id,
    submissionId: row.submissionId,
    brief:
      row.brief && typeof row.brief === "object" && !Array.isArray(row.brief)
        ? (row.brief as Record<string, unknown>)
        : {},
    talkingPoints: Array.isArray(row.talkingPoints)
      ? row.talkingPoints.filter((t): t is string => typeof t === "string").slice(0, 10)
      : [],
    scoreSummary:
      row.scoreSummary && typeof row.scoreSummary === "object" && !Array.isArray(row.scoreSummary)
        ? (row.scoreSummary as Record<string, unknown>)
        : null,
    bucket: row.bucket,
    discrepancyFlags: Array.isArray(row.discrepancyFlags) ? row.discrepancyFlags : [],
    llmPolished: Boolean(row.llmPolished),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Upsert durable brief linked to a submission (1:1). */
export async function upsertReadinessBrief(
  db: Db,
  input: UpsertReadinessBriefInput,
): Promise<ReadinessBriefPublic> {
  const submissionId = input.submissionId.trim();
  const now = new Date();
  const talkingPoints = input.talkingPoints
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.slice(0, 500))
    .slice(0, 10);

  const existing = await db
    .select()
    .from(readinessBriefs)
    .where(eq(readinessBriefs.submissionId, submissionId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(readinessBriefs)
      .set({
        brief: input.brief,
        talkingPoints,
        scoreSummary: input.scoreSummary ?? null,
        bucket: input.bucket ?? null,
        discrepancyFlags: input.discrepancyFlags ?? [],
        llmPolished: Boolean(input.llmPolished),
        updatedAt: now,
      })
      .where(eq(readinessBriefs.id, existing[0].id));
    const rows = await db
      .select()
      .from(readinessBriefs)
      .where(eq(readinessBriefs.id, existing[0].id))
      .limit(1);
    return toBriefPublic(rows[0]!);
  }

  const inserted = await db
    .insert(readinessBriefs)
    .values({
      submissionId,
      brief: input.brief,
      talkingPoints,
      scoreSummary: input.scoreSummary ?? null,
      bucket: input.bucket ?? null,
      discrepancyFlags: input.discrepancyFlags ?? [],
      llmPolished: Boolean(input.llmPolished),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toBriefPublic(inserted[0]!);
}

export async function findReadinessBriefBySubmissionId(
  db: Db,
  submissionId: string,
): Promise<ReadinessBriefPublic | null> {
  const id = submissionId.trim();
  if (!id) return null;
  const rows = await db
    .select()
    .from(readinessBriefs)
    .where(eq(readinessBriefs.submissionId, id))
    .limit(1);
  return rows[0] ? toBriefPublic(rows[0]) : null;
}

/** Ops list filters — bucket exact match + inclusive created_at date range (UTC day). */
export type ListOpsReadinessFilters = {
  bucket?: string | null;
  /** Inclusive start (YYYY-MM-DD or ISO). */
  from?: string | null;
  /** Inclusive end (YYYY-MM-DD or ISO). */
  to?: string | null;
  limit?: number;
};

/** Safe list row for internal ops — no raw paste, no credential-shaped fields. */
export type OpsReadinessListRow = {
  id: string;
  bucket: string | null;
  createdAt: string;
  contactName: string | null;
  contactEmail: string | null;
  company: string | null;
  overallScore: number | null;
  dimensionScores: Record<string, number> | null;
  discrepancyFlagCount: number;
  hasBrief: boolean;
};

export type OpsReadinessDetail = {
  id: string;
  bucket: string | null;
  createdAt: string;
  scores: Record<string, unknown> | null;
  discrepancyFlags: unknown[];
  contact: Record<string, unknown> | null;
  parsedReport: Record<string, unknown> | null;
  /** Already-redacted paste only; never unredacted secrets. */
  rawPasteRedacted: string | null;
  brief: ReadinessBriefPublic | null;
};

function parseOpsDayStart(value: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOpsDayEnd(value: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T23:59:59.999Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function contactNameFrom(contact: Record<string, unknown> | null): string | null {
  if (!contact) return null;
  for (const key of ["name", "fullName", "full_name"]) {
    const v = contact[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }
  return null;
}

function contactEmailFrom(contact: Record<string, unknown> | null): string | null {
  if (!contact) return null;
  const v = contact.email;
  if (typeof v === "string" && v.trim()) return v.trim().toLowerCase().slice(0, 254);
  return null;
}

function companyFrom(
  contact: Record<string, unknown> | null,
  brief: Record<string, unknown> | null,
): string | null {
  for (const source of [brief, contact]) {
    if (!source) continue;
    for (const key of ["company", "companyName", "company_name"]) {
      const v = source[key];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
    }
  }
  return null;
}

function overallFromScores(scores: Record<string, unknown> | null): number | null {
  if (!scores) return null;
  for (const key of ["overall", "overallScore", "total"]) {
    const v = scores[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function dimensionsFromScores(
  scores: Record<string, unknown> | null,
): Record<string, number> | null {
  if (!scores) return null;
  const dims = scores.dimensions;
  if (!dims || typeof dims !== "object" || Array.isArray(dims)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(dims as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Internal ops list of readiness submissions with optional bucket + date filters.
 * Sorted newest-first. Never returns raw/unredacted paste content.
 */
export async function listOpsReadinessSubmissions(
  db: Db,
  filters: ListOpsReadinessFilters = {},
): Promise<OpsReadinessListRow[]> {
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500));
  const conditions = [];

  const bucket = filters.bucket?.trim();
  if (bucket) {
    conditions.push(eq(readinessSubmissions.bucket, bucket.slice(0, 64)));
  }
  if (filters.from?.trim()) {
    const from = parseOpsDayStart(filters.from);
    if (from) conditions.push(gte(readinessSubmissions.createdAt, from));
  }
  if (filters.to?.trim()) {
    const to = parseOpsDayEnd(filters.to);
    if (to) conditions.push(lte(readinessSubmissions.createdAt, to));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: readinessSubmissions.id,
      bucket: readinessSubmissions.bucket,
      createdAt: readinessSubmissions.createdAt,
      scores: readinessSubmissions.scores,
      discrepancyFlags: readinessSubmissions.discrepancyFlags,
      contact: readinessSubmissions.contact,
      briefId: readinessBriefs.id,
      briefBody: readinessBriefs.brief,
      briefScoreSummary: readinessBriefs.scoreSummary,
    })
    .from(readinessSubmissions)
    .leftJoin(readinessBriefs, eq(readinessBriefs.submissionId, readinessSubmissions.id))
    .where(where)
    .orderBy(desc(readinessSubmissions.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const contact =
      row.contact && typeof row.contact === "object" && !Array.isArray(row.contact)
        ? (row.contact as Record<string, unknown>)
        : null;
    const briefBody =
      row.briefBody && typeof row.briefBody === "object" && !Array.isArray(row.briefBody)
        ? (row.briefBody as Record<string, unknown>)
        : null;
    const scores =
      row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)
        ? (row.scores as Record<string, unknown>)
        : row.briefScoreSummary &&
            typeof row.briefScoreSummary === "object" &&
            !Array.isArray(row.briefScoreSummary)
          ? (row.briefScoreSummary as Record<string, unknown>)
          : null;
    const flags = Array.isArray(row.discrepancyFlags) ? row.discrepancyFlags : [];
    return {
      id: row.id,
      bucket: row.bucket,
      createdAt: row.createdAt.toISOString(),
      contactName: contactNameFrom(contact),
      contactEmail: contactEmailFrom(contact),
      company: companyFrom(contact, briefBody),
      overallScore: overallFromScores(scores),
      dimensionScores: dimensionsFromScores(scores),
      discrepancyFlagCount: flags.length,
      hasBrief: Boolean(row.briefId),
    };
  });
}

/**
 * Internal ops detail for one submission + linked brief.
 * Raw paste is returned only in already-redacted form (raw_paste_redacted column).
 */
export async function getOpsReadinessSubmissionDetail(
  db: Db,
  submissionId: string,
): Promise<OpsReadinessDetail | null> {
  const id = submissionId.trim();
  if (!id) return null;

  const rows = await db
    .select()
    .from(readinessSubmissions)
    .where(eq(readinessSubmissions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const brief = await findReadinessBriefBySubmissionId(db, id);

  return {
    id: row.id,
    bucket: row.bucket,
    createdAt: row.createdAt.toISOString(),
    scores:
      row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)
        ? (row.scores as Record<string, unknown>)
        : (brief?.scoreSummary ?? null),
    discrepancyFlags: Array.isArray(row.discrepancyFlags) ? row.discrepancyFlags : [],
    contact:
      row.contact && typeof row.contact === "object" && !Array.isArray(row.contact)
        ? (row.contact as Record<string, unknown>)
        : null,
    parsedReport:
      row.parsedReport && typeof row.parsedReport === "object" && !Array.isArray(row.parsedReport)
        ? (row.parsedReport as Record<string, unknown>)
        : brief?.brief &&
            typeof (brief.brief as Record<string, unknown>).parsedTechReport === "object"
          ? ((brief.brief as Record<string, unknown>).parsedTechReport as Record<string, unknown>)
          : null,
    rawPasteRedacted: row.rawPasteRedacted ?? null,
    brief,
  };
}

/**
 * List readiness-related outbox jobs for a submission / token / recipient email.
 * Safe view only (no raw payload bodies or secrets).
 */
export async function listReadinessOutboxJobs(
  db: Db,
  options: {
    submissionId?: string | null;
    token?: string | null;
    email?: string | null;
    limit?: number;
  },
): Promise<SafeOutboxJobView[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const submissionId = options.submissionId?.trim() || null;
  const token = options.token?.trim() || null;
  const email = options.email?.trim().toLowerCase() || null;

  // Prefer payload match + recipient when available. All readiness kinds use null waitlist_entry_id.
  const rows = await db.execute(sql`
    SELECT
      id,
      kind,
      recipient,
      status,
      attempt_count,
      idempotency_key,
      next_attempt_at,
      created_at,
      sent_at
    FROM email_outbox
    WHERE kind IN (
      ${OUTBOX_KINDS.readinessPrompt},
      ${OUTBOX_KINDS.readinessSnapshot},
      ${OUTBOX_KINDS.readinessOpsBrief}
    )
    AND (
      (${submissionId}::text IS NOT NULL AND (
        payload->>'submissionId' = ${submissionId}
        OR payload->>'snapshotId' = ${submissionId}
      ))
      OR (${token}::text IS NOT NULL AND payload->>'token' = ${token})
      OR (${email}::text IS NOT NULL AND lower(recipient) = ${email})
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  const list = Array.isArray(rows)
    ? (rows as Record<string, unknown>[])
    : rows && typeof rows === "object" && Array.isArray((rows as { rows?: unknown }).rows)
      ? (rows as { rows: Record<string, unknown>[] }).rows
      : Array.from((rows as ArrayLike<Record<string, unknown>>) ?? []);

  return list.map((row) => {
    const attemptCount = row.attemptCount ?? row.attempt_count;
    const nextAttemptAt = row.nextAttemptAt ?? row.next_attempt_at;
    const createdAt = row.createdAt ?? row.created_at;
    const sentAt = row.sentAt ?? row.sent_at;
    const idempotencyKey = row.idempotencyKey ?? row.idempotency_key;
    return toSafeOutboxJobView({
      id: String(row.id),
      kind: String(row.kind),
      status: String(row.status),
      attemptCount: Number(attemptCount ?? 0),
      idempotencyKey: String(idempotencyKey ?? ""),
      recipient: row.recipient == null ? null : String(row.recipient),
      nextAttemptAt:
        nextAttemptAt instanceof Date
          ? nextAttemptAt
          : nextAttemptAt
            ? new Date(String(nextAttemptAt))
            : null,
      createdAt:
        createdAt instanceof Date
          ? createdAt
          : createdAt
            ? new Date(String(createdAt))
            : new Date(),
      sentAt: sentAt instanceof Date ? sentAt : sentAt ? new Date(String(sentAt)) : null,
    });
  });
}

/**
 * Merge discrepancy flags onto the latest submission for a session.
 * Also mirrors flags into the session draft for edge/read-back fallback.
 */
export async function appendSubmissionDiscrepancyFlags(
  db: Db,
  token: string,
  flags: unknown[],
  answers?: Record<string, unknown>,
): Promise<ReadinessSubmissionPublic | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const sessions = await db
    .select()
    .from(readinessSessions)
    .where(eq(readinessSessions.token, trimmed))
    .limit(1);
  const session = sessions[0];
  if (!session) return null;

  const existing = await findLatestSubmissionBySessionToken(db, trimmed);
  const mergedFlags = [
    ...(Array.isArray(existing?.discrepancyFlags) ? existing!.discrepancyFlags : []),
    ...flags,
  ];

  const draft =
    session.draft && typeof session.draft === "object" && !Array.isArray(session.draft)
      ? { ...(session.draft as Record<string, unknown>) }
      : {};
  draft.discrepancyFlags = mergedFlags;
  if (answers && typeof answers === "object") {
    draft.followupAnswers = { ...(draft.followupAnswers as object | undefined), ...answers };
  }
  draft.followupUpdatedAt = new Date().toISOString();

  await db
    .update(readinessSessions)
    .set({ draft, stage: "followups", updatedAt: new Date() })
    .where(eq(readinessSessions.token, trimmed));

  if (existing && !String(existing.id).startsWith("draft:")) {
    await db
      .update(readinessSubmissions)
      .set({ discrepancyFlags: mergedFlags })
      .where(eq(readinessSubmissions.id, existing.id));
  } else {
    await insertReadinessSubmission(db, {
      sessionId: session.id,
      parsedReport:
        draft.report && typeof draft.report === "object"
          ? (draft.report as Record<string, unknown>)
          : null,
      rawPasteRedacted:
        typeof draft.rawPasteRedacted === "string"
          ? draft.rawPasteRedacted
          : typeof draft.pasteText === "string"
            ? draft.pasteText
            : null,
      discrepancyFlags: mergedFlags,
      bucket: "followups",
      contact: {
        source: "readiness_followups",
        answers: answers ?? null,
      },
    });
  }

  return findLatestSubmissionBySessionToken(db, trimmed);
}

/** Upsert Stage 4 question bank seed rows (idempotent). */
export async function seedReadinessFollowupQuestions(
  db: Db,
  rows: Array<{
    questionKey: string;
    prompt: string;
    category: string;
    sortOrder: number;
    metadata: Record<string, unknown>;
  }>,
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    const existing = await db
      .select({ questionKey: readinessQuestionBank.questionKey })
      .from(readinessQuestionBank)
      .where(eq(readinessQuestionBank.questionKey, row.questionKey))
      .limit(1);
    if (existing[0]) {
      await db
        .update(readinessQuestionBank)
        .set({
          prompt: row.prompt,
          category: row.category,
          sortOrder: row.sortOrder,
          active: true,
          metadata: row.metadata,
        })
        .where(eq(readinessQuestionBank.questionKey, row.questionKey));
    } else {
      await db.insert(readinessQuestionBank).values({
        questionKey: row.questionKey,
        prompt: row.prompt,
        category: row.category,
        sortOrder: row.sortOrder,
        active: true,
        metadata: row.metadata,
      });
    }
    n += 1;
  }
  return n;
}
