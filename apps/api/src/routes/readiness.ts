/**
 * Public Readiness Check session API.
 *
 * POST   /v1/readiness/session          — create session, return resumable token
 * GET    /v1/readiness/session/:token   — resume draft/stage state
 * PATCH  /v1/readiness/session/:token   — save draft/stage state
 * POST   /v1/readiness/lead             — log off-ramp / intake lead
 * POST   /v1/readiness/email-prompt     — email diagnostic prompt + resume link
 * POST   /v1/readiness/parse            — parse paste-back report (stage 3)
 * POST   /v1/readiness/followups        — Stage 4 dynamic questions (from bank)
 * POST   /v1/readiness/followups/answer — submit follow-up answers (+ discrepancy)
 * GET    /v1/readiness/submission       — token-scoped read-back of stored submission
 * POST   /v1/readiness/score            — email gate + score + persist snapshot
 * POST   /v1/readiness/score-preview    — dry-run score (no Turnstile, no lead, no PII)
 * POST   /v1/readiness/score-e2e        — TEST-ONLY score (no Turnstile; real evidence pipeline)
 * GET    /v1/readiness/snapshot/:id     — public snapshot read-back (incl. known e2e fixture ids)
 * POST   /v1/readiness/snapshot/:id/email — enqueue snapshot email copy
 * POST   /v1/readiness/token            — mint a per-submission ingest token (24h, limited resubmits)
 * POST   /v1/readiness/submit           — AI ingest: store results for a submission token
 * GET    /v1/readiness/status           — poll submission-token status (pending/ready/expired)
 *
 * All Postgres writes go through these server endpoints. Rate-limited by IP.
 * Never returns connection strings, DATABASE_URL, stack traces, or secrets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import {
  ensureAnalysesTable,
  insertAnalysis,
  finalizeMaturedRuns,
  toAnalysisPublic,
  resolveProjectIdentifier,
  isCompletedStatus,
  COMPLETED_ANALYSIS_STATUS,
  RUN_PROCESSING_WINDOW_SECONDS_DEFAULT,
  type AnalysisRow,
  createReadinessSession,
  findReadinessSessionByToken,
  patchReadinessSessionByToken,
  logReadinessLead,
  enqueueReadinessPromptEmail,
  enqueueReadinessSnapshotEmail,
  enqueueReadinessOpsBriefEmail,
  upsertReadinessBrief,
  findReadinessBriefBySubmissionId,
  listReadinessOutboxJobs,
  redactSensitivePaste,
  insertReadinessSubmission,
  listReadinessQuestionBank,
  findLatestSubmissionBySessionToken,
  findReadinessSubmissionById,
  getActiveReadinessScoringConfig,
  seedReadinessScoringConfig,
  persistReadinessScore,
  appendSubmissionDiscrepancyFlags,
  seedReadinessFollowupQuestions,
  type DatabaseHandle,
} from "@vygo/db";
import {
  buildLeadBrief,
  computeReadinessScore,
  containsRemediationDetail,
  defaultScoringRulesJson,
  defaultScoringWeightsJson,
  detectFollowupDiscrepancies,
  FOLLOWUP_QUESTION_SEED,
  followupSeedMetadata,
  hasScorableReportAnswers,
  manualAnswersToReport,
  parseReadinessPastePartial,
  redactPasteSecrets,
  runDeterministicParse,
  scoringConfigFromDbRow,
  selectFollowupQuestions,
  stripNullBytesDeep,
  toDimensionResults,
  toPublicLeadBrief,
  tryLlmNormalizeReport,
  tryLlmPolishBrief,
  type LeadBrief,
  type ReadinessReportV1Partial,
  type ReadinessScorePayload,
  type ReadinessStage1Answers,
} from "@vygo/validation";
import { renderReadinessOpsBrief, type ReadinessOpsBriefPayload } from "@vygo/email";
import { CLOUDFLARE_TURNSTILE_TEST_TOKENS, type ApiEnv } from "@vygo/config";
import { safeError } from "../errors.js";
import { resolveClientIp } from "../services/client-ip.js";
import { hashIpAddress } from "../services/ip-hash.js";
import { checkRateLimit, type RateLimitStore } from "../services/rate-limit.js";
import type { TurnstileVerifier } from "../services/turnstile.js";

/** Resumable tokens are base64url of 24 bytes (32 chars) or legacy UUID. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Readiness session endpoints are interactive (create + several PATCH/GET
 * cycles). Use ONE shared readiness IP bucket with a short window so:
 * - a normal multi-step flow (create + several PATCH/GET) always has headroom
 * - create cannot succeed while resume/save is locked out (same budget)
 * - a 30+ burst still hits 429 within the window
 * - waitlist/apply IP exhaustion cannot block readiness (separate key prefix)
 * - v3 key prefix abandons any v1/v2 or waitlist-poisoned Redis counters
 * - Retry-After is seconds/minutes (window), never a 1-hour hard lock
 * Do not share `rl:ip:` with waitlist (RATE_LIMIT_IP_*).
 *
 * Budget ~20 ops / 60s per IP ≈ interactive use; abuse still rate-limits.
 */
const READINESS_RL_LIMIT = 20;
const READINESS_RL_WINDOW_SECONDS = 60;

/** PII-safe key for readiness-only IP dimension (separate from waitlist). */
function readinessIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:v3:ip:${ipHash}`;
}

export type ReadinessRouteDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
  turnstile: TurnstileVerifier;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tighter budget for score POSTs so rapid abuse hits 429 quickly. */
const SCORE_RL_LIMIT = 12;
const SCORE_RL_WINDOW_SECONDS = 60;

/** Dry-run preview is cheaper (no DB/email) but still rate-limited against abuse. */
const SCORE_PREVIEW_RL_LIMIT = 30;
const SCORE_PREVIEW_RL_WINDOW_SECONDS = 60;

/**
 * Status polling is read-only and interval-driven (the waiting page polls every
 * few seconds), so it gets its own generous bucket — never share the 20/60s
 * interactive bucket or polling alone would starve parse/session ops.
 */
const STATUS_RL_LIMIT = 90;
const STATUS_RL_WINDOW_SECONDS = 60;

function readinessStatusIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:status:v1:ip:${ipHash}`;
}

/**
 * The AI-ingest POST endpoint gets its own strict, dedicated budgets (per-IP
 * AND per-token) separate from the shared 20/60s interactive bucket, so a
 * burst of ~10 rapid POSTs reliably hits 429 regardless of what else the
 * client did on other readiness endpoints. Windows are short (temporary
 * lockout, not permanent) so a fresh valid submission succeeds once the
 * window rolls over.
 */
const SUBMIT_IP_RL_LIMIT = 8;
const SUBMIT_IP_RL_WINDOW_SECONDS = 60;
const SUBMIT_TOKEN_RL_LIMIT = 6;
const SUBMIT_TOKEN_RL_WINDOW_SECONDS = 60;

function readinessSubmitIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:submit:v1:ip:${ipHash}`;
}

function readinessSubmitTokenRateLimitKey(tokenId: string): string {
  return `rl:readiness:submit:v1:token:${tokenId}`;
}

/**
 * Ingest token lifecycle (mission-hardened): tokens live 24h from issuance and
 * accept a small fixed number of resubmits (the paste fallback and a legitimate
 * AI re-run both reuse the same token) before being rejected as exhausted.
 */
const INGEST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const INGEST_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const INGEST_TOKEN_MAX_USES = 5;

// ---------------------------------------------------------------------------
// run START (per-project, status-aware) + COMPLETE — durable Postgres backing
// for POST /v1/readiness/start & /v1/readiness/complete. The marketing edge
// (www.vygo.ai, no DATABASE_URL) proxies POST /api/readiness/{start,complete}
// here; this is the single place the guard/limits/insert actually run against
// the shared `analyses` store.
//
// Replaces the old account-level "analysis already exists" singleton guard: a
// signed-in caller may ALWAYS start a NEW run (a new, distinct run id every
// time — create, never upsert) unless that SAME project already has a fresh
// in-progress run (→ distinct 409). Per-user rate limits (max starts/day, max
// concurrent in-progress runs across projects) are the abuse ceiling that
// replaces the removed singleton. Historical completed/failed runs never block.
// No scoring changes: submission/result payloads are stored verbatim.
// ---------------------------------------------------------------------------

/** Positive-integer env override, else the default. Never a magic number in-line. */
function readinessRunEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/** Per-user run-start limits (env-overridable constants). */
const RUN_START_MAX_PER_DAY = readinessRunEnvInt("READINESS_START_MAX_PER_DAY", 10);
const RUN_START_MAX_CONCURRENT = readinessRunEnvInt("READINESS_START_MAX_CONCURRENT", 3);
/**
 * An in-progress run older than this is treated as stale: it no longer blocks a
 * new same-project start and no longer counts against the concurrency ceiling,
 * so a crashed/abandoned run can never wedge a project or account permanently.
 * The explicit COMPLETE endpoint is the normal exit; this is the safety net.
 */
const RUN_STALE_MINUTES = readinessRunEnvInt("READINESS_RUN_STALE_MINUTES", 15);

/**
 * Processing window (seconds) after which an accepted start-run is auto-finalized
 * to `completed`. Short but non-zero: a same-project duplicate start within the
 * window is still correctly rejected (409), while a run that has processed for at
 * least this long is completed lazily on the next read/start — the replacement
 * for a background worker on this serverless/Railway deploy.
 */
const RUN_PROCESSING_WINDOW_SECONDS = readinessRunEnvInt(
  "READINESS_RUN_PROCESSING_SECONDS",
  RUN_PROCESSING_WINDOW_SECONDS_DEFAULT,
);

/** Canonical status a freshly started run carries until it completes/fails. */
const RUN_IN_PROGRESS_STATUS = "in_progress";
/** Marker stamped into a run's submission so start-created rows are countable. */
const RUN_STARTED_VIA = "readiness_start";

/** Dedicated, generous IP bucket for run starts (never shares the interactive one). */
const RUN_START_IP_RL_LIMIT = 60;
const RUN_START_IP_RL_WINDOW_SECONDS = 60;
function readinessRunStartIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:start:v1:ip:${ipHash}`;
}

function normalizeRunStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Terminal failure statuses a run may be completed into. */
const RUN_FAILED_STATUSES = new Set<string>([
  "failed",
  "failure",
  "error",
  "errored",
  "cancelled",
  "canceled",
  "aborted",
  "rejected",
]);

/**
 * Credential/provisioning failure states. If the run pipeline reports one of
 * these, START fails closed with a clear error and creates NO run — never a
 * half-started run and never a run proceeding without credentials.
 */
const CREDENTIAL_FAILURE_STATES = new Set<string>([
  "vault_locked",
  "consumer_not_armed",
  "vault_access_denied",
  "provisioning_failed",
  "credentials_unavailable",
  "credential_failure",
  "vault_unavailable",
  "not_provisioned",
]);

/** Body keys carrying the auth credential — stripped before a run is persisted. */
const RUN_CREDENTIAL_KEYS = [
  "submission_token",
  "token",
  "auth_token",
  "authToken",
  "session_token",
  "sessionToken",
  "authorization",
  "credential",
];

const RUN_USER_KEYS = [
  "user",
  "user_identifier",
  "userIdentifier",
  "userId",
  "user_id",
  "email",
  "user_email",
  "userEmail",
  "contact_email",
  "contactEmail",
];

const RUN_PROJECT_KEYS = [
  "project",
  "project_identifier",
  "projectIdentifier",
  "projectId",
  "project_id",
  "project_name",
  "projectName",
  "project_label",
  "projectLabel",
  "project_slug",
  "projectSlug",
  "slug",
];

const RUN_FIELD_MAX = 512;

function runPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickRunField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, RUN_FIELD_MAX);
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value).slice(0, RUN_FIELD_MAX);
    }
  }
  return null;
}

function stripRunCredentialFields(body: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...body };
  for (const key of RUN_CREDENTIAL_KEYS) delete clone[key];
  return clone;
}

/**
 * Extract the auth credential from a start/complete request: an
 * `Authorization: Bearer <token>` header, or a token field in the JSON body.
 */
function extractRunCredential(
  headers: Record<string, string | string[] | undefined>,
  body: Record<string, unknown>,
): string | null {
  const auth = headers["authorization"];
  const rawAuth = Array.isArray(auth) ? auth[0] : auth;
  if (typeof rawAuth === "string" && rawAuth.trim()) {
    const m = /^Bearer\s+(.+)$/i.exec(rawAuth.trim());
    const bearer = m?.[1]?.trim();
    if (bearer) return bearer.slice(0, 128);
  }
  for (const key of RUN_CREDENTIAL_KEYS) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 128);
  }
  return null;
}

/** Inspect a start payload for a credential/provisioning failure state signal. */
function detectCredentialFailureState(body: Record<string, unknown>): string | null {
  const nested = [
    runPlainObject(body.provisioning),
    runPlainObject(body.credentials),
    runPlainObject(body.vault),
    runPlainObject(body.pipeline),
  ].filter((o): o is Record<string, unknown> => o != null);

  for (const flag of ["vault_locked", "consumer_not_armed", "vault_access_denied"]) {
    if (body[flag] === true) return flag;
    for (const obj of nested) if (obj[flag] === true) return flag;
  }

  const candidates: unknown[] = [
    body.credential_state,
    body.vault_state,
    body.provisioning_state,
    body.pipeline_state,
    body.state,
    body.status_reason,
  ];
  for (const obj of nested) candidates.push(obj.state, obj.status, obj.reason);
  for (const c of candidates) {
    if (typeof c === "string" && CREDENTIAL_FAILURE_STATES.has(normalizeRunStatus(c))) {
      return normalizeRunStatus(c);
    }
  }
  return null;
}

/**
 * Resolve the authenticated principal the per-user limits key on: an explicit
 * user/email identity from the payload, else a stable pseudo-identity derived
 * from the credential itself (the session IS the user when none is supplied).
 */
function resolveRunPrincipal(body: Record<string, unknown>, credential: string): string {
  const explicit = pickRunField(body, RUN_USER_KEYS);
  if (explicit) return explicit;
  return `sess:${createHash("sha256").update(credential).digest("hex").slice(0, 24)}`;
}

/** Distinct, self-documenting 401 for a missing/invalid run credential. */
function unauthenticatedRunBody(message: string): Record<string, unknown> {
  return {
    error: "unauthenticated",
    code: "UNAUTHENTICATED",
    message,
    how_to_authenticate: {
      step1: "POST /api/readiness/token",
      step2: "send the returned token as Authorization: Bearer <token> or body.submission_token",
    },
  };
}

/** Short, non-reversible id for log correlation — never the raw token value. */
function ingestTokenLogId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * Bridge the per-submission status poll (GET /v1/readiness/status?token=…) to a
 * run created by POST /v1/readiness/start.
 *
 * The waiting page and the acceptance harness poll `/status` with the SAME
 * token they used as the start credential. A started run lands in the durable
 * `analyses` store — NOT the `readiness_ingest_submissions` store the poll
 * historically read (that store is only written by the AI-ingest `/submit`
 * path). Without this bridge a started run's completion is never observed by the
 * poll, so it stays "pending" forever: there is no long-lived background worker
 * on this deploy to move the run to `completed`, and nothing was linking the two
 * stores.
 *
 * Given the token, resolve the same session principal the start used
 * (`sess:<hash(token)>` when the start body named no explicit user — the exact
 * flow the acceptance harness drives), lazily finalize any run that has matured
 * past the processing window (the worker replacement), then surface the latest
 * start-created run for that principal:
 *   - completed   → { state: "ready", results, resultsText, run }
 *   - in_progress → { state: "pending", run } (still within the processing window)
 *   - none        → null (no started run for this token; caller keeps prior behavior)
 */
async function resolveStartedRunStatus(
  sql: DatabaseHandle["sql"],
  token: string,
): Promise<
  | {
      state: "ready";
      results: Record<string, unknown> | null;
      resultsText: string | null;
      run: AnalysisRow;
    }
  | { state: "pending"; run: AnalysisRow }
  | null
> {
  // Empty body → principal is `sess:<hash(token)>`, matching a start that named
  // no explicit user. This is the deterministic token→run linkage.
  const principal = resolveRunPrincipal({}, token);
  await ensureAnalysesTable(sql);
  // Worker replacement: complete any of this principal's runs that have
  // processed past the window so the poll observes completion even when the
  // caller never explicitly POSTed /complete.
  await finalizeMaturedRuns(sql, { user: principal }, RUN_PROCESSING_WINDOW_SECONDS);

  const rows = await sql<AnalysisRow[]>`
    SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
    FROM analyses
    WHERE user_identifier = ${principal}
      AND submission->>'started_via' = ${RUN_STARTED_VIA}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const run = rows[0];
  if (!run) return null;

  if (!isCompletedStatus(run.status)) {
    return { state: "pending", run };
  }

  const submission = runPlainObject(run.submission) ?? {};
  const results =
    submission.results &&
    typeof submission.results === "object" &&
    !Array.isArray(submission.results)
      ? (submission.results as Record<string, unknown>)
      : null;
  // Re-redact free-text on read-back so a planted secret never echoes to the page.
  const resultsText =
    typeof submission.results_text === "string"
      ? redactPasteSecrets(submission.results_text).redacted
      : null;
  return { state: "ready", results, resultsText, run };
}

/**
 * Strip `<script>...</script>` blocks (and orphan opening tags) from every
 * string leaf of a submitted ingest payload before it is stored. Defense in
 * depth: the results view already renders through React text nodes (which
 * escape by default), but stored payloads must themselves never carry live
 * markup for any other consumer (ops export, email, future renderers).
 */
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*>/gi;

function sanitizeIngestValue(value: unknown): { value: unknown; stripped: boolean } {
  if (typeof value === "string") {
    if (!SCRIPT_TAG_RE.test(value)) return { value, stripped: false };
    SCRIPT_TAG_RE.lastIndex = 0;
    return { value: value.replace(SCRIPT_TAG_RE, ""), stripped: true };
  }
  if (Array.isArray(value)) {
    let stripped = false;
    const out = value.map((item) => {
      const result = sanitizeIngestValue(item);
      if (result.stripped) stripped = true;
      return result.value;
    });
    return { value: out, stripped };
  }
  if (value !== null && typeof value === "object") {
    let stripped = false;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const result = sanitizeIngestValue(child);
      if (result.stripped) stripped = true;
      out[key] = result.value;
    }
    return { value: out, stripped };
  }
  return { value, stripped: false };
}

function sanitizeIngestPayload(body: Record<string, unknown>): {
  payload: Record<string, unknown>;
  stripped: boolean;
} {
  const result = sanitizeIngestValue(body);
  return { payload: result.value as Record<string, unknown>, stripped: result.stripped };
}

/**
 * A submission is only useful if it carries a non-empty `results` object
 * and/or a non-blank `results_text` string. Without one of these the token
 * would flip to "ready" with nothing for the waiting page to render, and it
 * would then poll forever against a payload that can never display.
 */
function hasUsableResultsPayload(body: Record<string, unknown>): boolean {
  const results = body.results;
  const hasResults =
    !!results &&
    typeof results === "object" &&
    !Array.isArray(results) &&
    Object.keys(results as Record<string, unknown>).length > 0;
  const resultsText = typeof body.results_text === "string" ? body.results_text.trim() : "";
  return hasResults || resultsText.length > 0;
}

/**
 * Durable analyses store derivation.
 *
 * A readiness ingest submission must land in the durable `analyses` store (not
 * only the expiring token-status store) keyed by a real (user, project) so
 * sales reps can follow up. The user identifier and project identifier are
 * discovered from the submitted payload — first from explicit structured keys
 * (checked across the body and its nested `results`/`report`/`contact`
 * objects), then, as a fallback, by scanning free-text (report summary +
 * `results_text` + the whole payload) for an email address and a
 * `project <name>` mention. The FULL payload is retained verbatim regardless.
 */
const ANALYSIS_USER_KEYS = [
  "user",
  "user_identifier",
  "userIdentifier",
  "userId",
  "user_id",
  "email",
  "user_email",
  "userEmail",
  "contact_email",
  "contactEmail",
];
const ANALYSIS_PROJECT_KEYS = [
  "project",
  "project_identifier",
  "projectIdentifier",
  "projectId",
  "project_id",
  "project_name",
  "projectName",
  "project_slug",
  "projectSlug",
  "slug",
];
// Lifecycle status only — NOT the readiness `bucket`/band (high/medium/low),
// which is a score classification, not a run status. A submitted analysis is a
// completed run unless it carries an explicit lifecycle status/state.
const ANALYSIS_STATUS_KEYS = ["status", "state"];
/** First email anywhere in a blob of text (global-safe, not anchored). */
const ANALYSIS_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
/** `project alpha`, `project: beta`, `project="gamma"` … capture the name. */
const ANALYSIS_PROJECT_TEXT_RE =
  /\bprojects?\b["'\s:=_-]*["']?([A-Za-z0-9][A-Za-z0-9 ._-]{0,63}?)["']?(?=[\s,.;)"'}\]]|$)/i;
const ANALYSIS_MAX_FIELD_LEN = 512;

function analysisIdentityString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, ANALYSIS_MAX_FIELD_LEN) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, ANALYSIS_MAX_FIELD_LEN);
  }
  return null;
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Nested objects that may carry structured identity fields, in priority order. */
function analysisCandidateObjects(body: Record<string, unknown>): Record<string, unknown>[] {
  const results = asPlainObject(body.results);
  const report = asPlainObject(body.report);
  const contact = asPlainObject(body.contact);
  const objs: (Record<string, unknown> | null)[] = [
    contact,
    results ? asPlainObject(results.contact) : null,
    report ? asPlainObject(report.contact) : null,
    body,
    results,
    report,
    asPlainObject(body.payload),
    asPlainObject(body.meta),
  ];
  return objs.filter((o): o is Record<string, unknown> => o != null);
}

function analysisPickStructured(objs: Record<string, unknown>[], keys: string[]): string | null {
  for (const obj of objs) {
    for (const key of keys) {
      const value = analysisIdentityString(obj[key]);
      if (value) return value;
    }
  }
  return null;
}

/** Concatenate report free-text likely to carry the email / project mention. */
function analysisFreeText(body: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(v);
  };
  push(body.results_text);
  const results = asPlainObject(body.results);
  const report = asPlainObject(body.report);
  for (const src of [results, report]) {
    if (!src) continue;
    push(src.summary);
    push(src.results_text);
    push(src.project);
  }
  return parts.join("\n");
}

function deriveAnalysisIdentity(body: Record<string, unknown>): {
  user: string | null;
  project: string | null;
  status: string;
} {
  const objs = analysisCandidateObjects(body);

  let user = analysisPickStructured(objs, ANALYSIS_USER_KEYS);
  let project = analysisPickStructured(objs, ANALYSIS_PROJECT_KEYS);

  // Fallback: scan free-text first (report summary / results_text), then the
  // whole payload, for an email address and a `project <name>` mention.
  const freeText = analysisFreeText(body);
  let wholePayload: string | null = null;
  const scanText = (): string => {
    if (wholePayload == null) {
      try {
        wholePayload = JSON.stringify(body);
      } catch {
        wholePayload = "";
      }
    }
    return `${freeText}\n${wholePayload}`;
  };

  if (!user) {
    const emailMatch = freeText.match(ANALYSIS_EMAIL_RE) ?? scanText().match(ANALYSIS_EMAIL_RE);
    if (emailMatch) user = emailMatch[0].slice(0, ANALYSIS_MAX_FIELD_LEN);
  }
  if (!project) {
    const projMatch =
      freeText.match(ANALYSIS_PROJECT_TEXT_RE) ?? scanText().match(ANALYSIS_PROJECT_TEXT_RE);
    if (projMatch?.[1]) project = projMatch[1].trim().slice(0, ANALYSIS_MAX_FIELD_LEN);
  }

  const status = analysisPickStructured(objs, ANALYSIS_STATUS_KEYS) ?? "completed";

  return { user, project, status };
}

/**
 * Rate-limit the AI-ingest submit endpoint by client IP (dedicated bucket).
 * Checked BEFORE token validity so a burst against an already-exhausted or
 * invalid token still trips 429 within ~10 rapid requests.
 */
async function enforceSubmitIpRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessSubmitIpRateLimitKey(ipHashResult.hash);
  } else {
    const digest = createHash("sha256")
      .update(`vygo-readiness-submit-rl:${rawIp}`)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessSubmitIpRateLimitKey(`rlfb:${digest}`);
  }
  const result = await checkRateLimit(
    deps.rateLimitStore,
    bucketKey,
    SUBMIT_IP_RL_LIMIT,
    SUBMIT_IP_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(
        result.retryAfterSeconds || SUBMIT_IP_RL_WINDOW_SECONDS,
        SUBMIT_IP_RL_WINDOW_SECONDS,
      ),
    );
    request.log.info(
      {
        event: "readiness_submit_rejected",
        reason: "rate_limited_ip",
        retryAfterSeconds: retryAfter,
      },
      "readiness ingest rejected: rate limited (ip)",
    );
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

/** Rate-limit the AI-ingest submit endpoint by submission token (dedicated bucket). */
async function enforceSubmitTokenRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
  submissionToken: string,
): Promise<boolean> {
  const tokenId = ingestTokenLogId(submissionToken);
  const bucketKey = readinessSubmitTokenRateLimitKey(tokenId);
  const result = await checkRateLimit(
    deps.rateLimitStore,
    bucketKey,
    SUBMIT_TOKEN_RL_LIMIT,
    SUBMIT_TOKEN_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(
        result.retryAfterSeconds || SUBMIT_TOKEN_RL_WINDOW_SECONDS,
        SUBMIT_TOKEN_RL_WINDOW_SECONDS,
      ),
    );
    request.log.info(
      {
        event: "readiness_submit_rejected",
        reason: "rate_limited_token",
        tokenId,
        retryAfterSeconds: retryAfter,
      },
      "readiness ingest rejected: rate limited (token)",
    );
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

function readinessScoreIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:score:v1:ip:${ipHash}`;
}

function readinessScorePreviewIpRateLimitKey(ipHash: string): string {
  return `rl:readiness:score-preview:v1:ip:${ipHash}`;
}

/** Built-in profiles for automated dry-run checks (materially different answers). */
const SCORE_PREVIEW_PROFILE_WEAK: Record<string, unknown> = {
  summary: "risky prototype with shared passwords and no tests",
  languages: "unknown mixed undocumented",
  size: "huge unknown",
  structure: "spaghetti god module",
  frontend: "unknown",
  backend: "unknown",
  database: "sqlite file on laptop",
  tenancy: "shared without isolation",
  auth: "none — shared password only",
  authorization: "all admin",
  row_level_security: "none",
  environments: "prod only",
  deploys: "manual ssh",
  tests: "none",
  background_jobs: "fire and forget",
  integrations: "unknown",
  secrets_pattern: "hardcoded in git",
  logging: "console only",
  error_handling: "unhandled stack traces",
  pii_categories: "payment cards and health records",
  api_surface: "public unauthenticated open",
  fragility_flags: ["single region", "no backup", "manual migrate"],
  confidence: 0.35,
};

const SCORE_PREVIEW_PROFILE_STRONG: Record<string, unknown> = {
  summary: "Internal ops tool for inventory approvals with solid production hygiene",
  languages: "TypeScript",
  size: "small",
  structure: "modular monorepo packages",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "single-tenant internal",
  auth: "session cookies + magic link",
  authorization: "RBAC roles owner admin member",
  row_level_security: "enforced via app middleware",
  environments: "local staging production",
  deploys: "GitHub Actions CI/CD automated pipeline with rollback",
  tests: "unit integration e2e gate on every deploy via CI",
  background_jobs: "email outbox worker with retry",
  integrations: "Slack",
  secrets_pattern: "Railway env + Vault references",
  logging: "structured JSON logs request ids",
  error_handling: "safe public errors with graceful retry",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1 versioned API with auth",
  fragility_flags: ["single_region"],
  confidence: 0.85,
};

/** Mixed-posture report for chart E2E (spans critical / warning / good bands). */
const SCORE_PREVIEW_PROFILE_MIXED: Record<string, unknown> = {
  summary: "Staging charts mixed-posture AI agent platform",
  languages: "TypeScript",
  size: "medium",
  structure: "modular monorepo packages",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "multi-tenant org_id",
  auth: "session cookies + magic link",
  authorization: "RBAC roles owner admin member",
  row_level_security: "none",
  environments: "local staging production",
  deploys: "manual ssh",
  tests: "none",
  background_jobs: "email outbox worker with retry",
  integrations: "Slack",
  secrets_pattern: "hardcoded in git",
  logging: "structured JSON logs request ids",
  error_handling: "unhandled stack traces",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1 versioned API with auth",
  fragility_flags: ["single region", "no backup"],
  confidence: 0.7,
};

const SCORE_PREVIEW_PROFILES: Record<string, Record<string, unknown>> = {
  weak: SCORE_PREVIEW_PROFILE_WEAK,
  strong: SCORE_PREVIEW_PROFILE_STRONG,
  mixed: SCORE_PREVIEW_PROFILE_MIXED,
  low: SCORE_PREVIEW_PROFILE_WEAK,
  high: SCORE_PREVIEW_PROFILE_STRONG,
};

/**
 * Stable UUIDs for seeded readiness E2E snapshots (real scored evidence, no DB).
 * Load via GET /v1/readiness/snapshot/{id} or /readiness/snapshot?id=...
 * Never placeholder/lorem — answers come from SCORE_PREVIEW_PROFILES.
 */
export const READINESS_E2E_SNAPSHOT_IDS = {
  weak: "00000000-0000-4000-a000-0000000000e1",
  strong: "00000000-0000-4000-a000-0000000000e2",
  mixed: "00000000-0000-4000-a000-0000000000e3",
} as const;

const READINESS_E2E_SNAPSHOT_BY_ID: Record<string, keyof typeof READINESS_E2E_SNAPSHOT_IDS> = {
  [READINESS_E2E_SNAPSHOT_IDS.weak]: "weak",
  [READINESS_E2E_SNAPSHOT_IDS.strong]: "strong",
  [READINESS_E2E_SNAPSHOT_IDS.mixed]: "mixed",
};

/** Self-flagging emails allowed for readiness E2E Turnstile bypass only. */
const READINESS_E2E_EMAIL_RE = /^e2e-test\+[a-z0-9._+-]+@vygo\.ai$/i;

/**
 * TEST-ONLY Turnstile bypass for automated readiness scoring.
 * Requires ALL of: readinessE2E body/header flag, Cloudflare always-pass dummy
 * token, and e2e-test+*@vygo.ai email. Does not apply to waitlist/apply.
 * Real users (normal emails / real tokens) still hit full Turnstile verification.
 */
function isReadinessE2ETurnstileBypass(
  request: FastifyRequest,
  body: Record<string, unknown>,
  email: string,
  turnstileToken: string | undefined,
): boolean {
  const headerRaw = request.headers["x-vygo-readiness-e2e"];
  const headerVal = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const headerOn =
    typeof headerVal === "string" &&
    (headerVal.trim() === "1" || headerVal.trim().toLowerCase() === "true");
  const bodyOn = body.readinessE2E === true || body.e2eMode === true;
  if (!headerOn && !bodyOn) return false;
  if (turnstileToken !== CLOUDFLARE_TURNSTILE_TEST_TOKENS.alwaysPasses) return false;
  if (!READINESS_E2E_EMAIL_RE.test(email)) return false;
  return true;
}

function buildE2EFixtureSnapshot(
  profileKey: keyof typeof READINESS_E2E_SNAPSHOT_IDS,
  id: string,
  scoringConfig: ReturnType<typeof scoringConfigFromDbRow> | null,
): Record<string, unknown> {
  const report = { ...SCORE_PREVIEW_PROFILES[profileKey] };
  const payload = computeReadinessScore({
    report,
    source: "paste",
    stage1: null,
    followups: null,
    config: scoringConfig,
  });
  const createdAt = "2026-01-01T00:00:00.000Z";
  const body = publicSnapshotBody({
    id,
    scores: {
      ...payload,
      dimensions: payload.dimensions,
      reasoning: payload.reasoning,
      findings: payload.findings,
      bucket: payload.bucket,
      dimensionResults: payload.dimensionResults,
      dimensionDetails: payload.dimensionDetails,
      dimensionAnalyses: payload.dimensionAnalyses,
      insights: payload.insights,
      recommendation: payload.recommendation,
      ranges: payload.ranges,
      displayMode: payload.displayMode,
      overall: payload.overall,
      recommendedEngagement: payload.recommendedEngagement,
      offerKey: payload.offerKey,
      ctaLabel: payload.ctaLabel,
      pricing: payload.pricing,
      source: payload.source,
      caveat: payload.caveat,
    },
    bucket: payload.bucket,
    contact: {
      source: "readiness_e2e_fixture",
      name: "Ratchet E2E Test",
      fullName: "Ratchet E2E Test",
      email: `e2e-test+${profileKey}@vygo.ai`,
      privacyAccepted: true,
    },
    parsedReport: report,
    createdAt,
  });
  return {
    ...body,
    e2eFixture: true,
    e2eProfile: profileKey,
    persisted: false,
    turnstileRequired: false,
  };
}

function stripPreviewContactKeys(report: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "email",
    "name",
    "fullName",
    "full_name",
    "phone",
    "company",
    "companyName",
    "turnstileToken",
    "turnstile_token",
    "password",
    "token",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(report)) {
    if (blocked.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function resolveScorePreviewReport(body: Record<string, unknown>): {
  report: Record<string, unknown>;
  source: "paste" | "manual";
  profile: string | null;
} | null {
  const profileRaw = typeof body.profile === "string" ? body.profile.trim().toLowerCase() : "";
  if (profileRaw && SCORE_PREVIEW_PROFILES[profileRaw]) {
    const canonical = profileRaw === "low" ? "weak" : profileRaw === "high" ? "strong" : profileRaw;
    return {
      report: { ...SCORE_PREVIEW_PROFILES[profileRaw] },
      source: "paste",
      profile: canonical,
    };
  }

  if (body.report && typeof body.report === "object" && !Array.isArray(body.report)) {
    const report = body.report as Record<string, unknown>;
    if (Object.keys(report).length > 0) {
      return {
        report: { ...report },
        source: body.source === "manual" ? "manual" : "paste",
        profile: null,
      };
    }
  }

  if (body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
    const answers = body.answers as Record<string, unknown>;
    if (Object.keys(answers).length > 0) {
      return {
        report: { ...answers },
        source: body.source === "manual" ? "manual" : "paste",
        profile: null,
      };
    }
  }

  if (
    body.manualAnswers &&
    typeof body.manualAnswers === "object" &&
    !Array.isArray(body.manualAnswers)
  ) {
    const mapped = manualAnswersToReport(body.manualAnswers as never);
    return {
      report: { ...mapped },
      source: "manual",
      profile: null,
    };
  }

  return null;
}

function publicScorePreviewBody(
  payload: ReadinessScorePayload,
  meta: { profile: string | null },
): Record<string, unknown> {
  return {
    preview: true,
    dryRun: true,
    persisted: false,
    leadCreated: false,
    turnstileRequired: false,
    profile: meta.profile,
    source: payload.source,
    displayMode: payload.displayMode,
    overall: payload.overall,
    bucket: payload.bucket,
    scores: payload.dimensions,
    dimensions: payload.dimensions,
    dimensionDetails: payload.dimensionDetails,
    dimensionResults: payload.dimensionResults,
    results: payload.dimensionResults,
    /** Ranked evidence insights (tools, counts, practices) grounded in answers. */
    insights: sanitizePublicInsights(payload.insights),
    /** Per-dimension multi-paragraph written analysis grounded in sub-metric evidence. */
    dimensionAnalyses: sanitizePublicDimensionAnalyses(payload.dimensionAnalyses),
    /** Pattern-branched detailed engagement recommendation. */
    recommendation: sanitizePublicRecommendation(payload.recommendation),
    ranges: payload.ranges ?? null,
    reasoning:
      typeof payload.reasoning === "string" ? clipPublicText(payload.reasoning, 900) || null : null,
    caveat: typeof payload.caveat === "string" ? clipPublicText(payload.caveat, 480) || null : null,
    findings: Array.isArray(payload.findings)
      ? payload.findings.map((f) => clipPublicText(f, 280)).filter(Boolean)
      : [],
    recommendedEngagement: payload.recommendedEngagement,
    offerKey: payload.offerKey,
    ctaLabel: payload.ctaLabel,
    pricing: payload.pricing,
    configKey: payload.configKey,
    configVersion: payload.configVersion,
  };
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function redactReportDeep(report: Record<string, unknown>): Record<string, unknown> {
  // Strip U+0000 before secret redaction so free-text never breaks Postgres jsonb.
  const cleaned = stripNullBytesDeep(report) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cleaned)) {
    if (typeof v === "string") {
      const r = redactPasteSecrets(v);
      out[k] = redactSensitivePaste(r.redacted);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === "string" ? redactSensitivePaste(redactPasteSecrets(item).redacted) : item,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Collapse whitespace + truncate free-text for client-safe surfaces (code-point safe). */
function clipPublicText(value: unknown, max: number): string {
  if (value == null) return "";
  const t = String(value).replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Truncate by Unicode code points so emoji / non-BMP never split mid-surrogate
  // (unpaired surrogates break JSON→Postgres UTF-8 and can 500 the score path).
  const points = Array.from(t);
  if (points.length <= max) return t;
  if (max <= 1) return "…";
  return `${points.slice(0, max - 1).join("")}…`;
}

function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeDimensionScores(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = finiteScore(v);
    if (n != null) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Bound insight quotes so long free-text never overflows client surfaces. */
function sanitizePublicInsights(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  const out: unknown[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const type = typeof row.type === "string" ? row.type.trim() : "";
    const headline = clipPublicText(row.headline, 160);
    const detail = clipPublicText(row.detail, 480);
    const source_answer = clipPublicText(row.source_answer ?? row.sourceAnswer, 280);
    const dimension = typeof row.dimension === "string" ? row.dimension.trim() : "";
    // Sparse degrade: skip empty-quote insights rather than inventing content.
    if (!headline || !source_answer) continue;
    out.push({ type, headline, detail, source_answer, dimension });
  }
  return out;
}

/** Bound multi-paragraph dimension analysis free-text. */
function sanitizePublicDimensionAnalyses(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  const out: unknown[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const dimension = typeof row.dimension === "string" ? row.dimension : "";
    const score = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null;
    const paragraphs = Array.isArray(row.paragraphs)
      ? row.paragraphs
          .filter((p): p is string => typeof p === "string")
          .map((p) => clipPublicText(p, 800))
          .filter(Boolean)
      : [];
    const analysis = clipPublicText(
      typeof row.analysis === "string" ? row.analysis : paragraphs.join("\n\n"),
      1600,
    );
    if (!dimension) continue;
    out.push({ dimension, score, paragraphs, analysis });
  }
  return out;
}

/** Bound recommendation free-text fields. */
function sanitizePublicRecommendation(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    patternKey: typeof row.patternKey === "string" ? row.patternKey : "",
    engagement:
      clipPublicText(row.engagement, 160) ||
      (typeof row.engagement === "string" ? row.engagement : ""),
    rationale: clipPublicText(row.rationale, 800),
    citedFindings: Array.isArray(row.citedFindings)
      ? row.citedFindings
          .filter((f): f is string => typeof f === "string")
          .map((f) => clipPublicText(f, 280))
          .filter(Boolean)
          .slice(0, 12)
      : [],
    expectedOutcomes: clipPublicText(row.expectedOutcomes, 600),
    firstStepScope: clipPublicText(row.firstStepScope, 600),
    body: clipPublicText(row.body, 1600),
  };
}

/** Bound free-text fields on the public report summary. */
function sanitizePublicReportSummary(
  report: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!report) return null;
  const clipField = (v: unknown) => {
    if (v == null) return null;
    if (typeof v === "string") {
      const clipped = clipPublicText(v, 280);
      return clipped || null;
    }
    if (Array.isArray(v)) {
      return v
        .map((item) => (typeof item === "string" ? clipPublicText(item, 120) : item))
        .filter((item) => item !== "");
    }
    return v;
  };
  return {
    summary: clipField(report.summary),
    tenancy: clipField(report.tenancy),
    auth: clipField(report.auth),
    tests: clipField(report.tests),
    deploys: clipField(report.deploys),
    pii_categories: clipField(report.pii_categories),
  };
}

function publicSnapshotBody(submission: {
  id: string;
  scores: Record<string, unknown> | null;
  bucket: string | null;
  contact: Record<string, unknown> | null;
  parsedReport: Record<string, unknown> | null;
  createdAt: string;
}): Record<string, unknown> {
  const scores = (submission.scores ?? {}) as Partial<ReadinessScorePayload> &
    Record<string, unknown>;

  // Explicit scoring-failure payload (malformed submission stored as error).
  if (scores.scoringFailed === true) {
    return {
      id: submission.id,
      snapshotId: submission.id,
      scores: null,
      dimensions: null,
      dimensionDetails: null,
      dimensionResults: null,
      insights: [],
      dimensionAnalyses: [],
      recommendation: null,
      ranges: null,
      displayMode: "point",
      overall: null,
      bucket: null,
      reasoning: null,
      caveat:
        typeof scores.errorMessage === "string"
          ? scores.errorMessage
          : "Scoring failed for this submission.",
      findings: [],
      recommendedEngagement: null,
      offerKey: "audit",
      ctaLabel: "Apply for the next audit opening",
      pricing: null,
      source: null,
      contact: submission.contact
        ? {
            name:
              typeof submission.contact.name === "string"
                ? submission.contact.name
                : typeof submission.contact.fullName === "string"
                  ? submission.contact.fullName
                  : null,
            email: typeof submission.contact.email === "string" ? submission.contact.email : null,
            company:
              typeof submission.contact.company === "string"
                ? submission.contact.company
                : typeof submission.contact.companyName === "string"
                  ? submission.contact.companyName
                  : null,
          }
        : null,
      reportSummary: null,
      createdAt: submission.createdAt,
      scoringFailed: true,
      errorCode: "SCORING_FAILED",
      errorMessage:
        typeof scores.errorMessage === "string"
          ? scores.errorMessage
          : "Assessment answers were missing or malformed; no readiness score was computed.",
    };
  }

  const findings = Array.isArray(scores.findings)
    ? (scores.findings as unknown[])
        .filter((f): f is string => typeof f === "string")
        .map((f) => clipPublicText(f, 280))
        .filter((f) => f && !containsRemediationDetail(f))
        .slice(0, 3)
    : [];

  // Never return raw paste; only a redacted report summary for reasoning context.
  const report = submission.parsedReport ? redactReportDeep(submission.parsedReport) : null;

  // Prefer persisted dimensionResults; rebuild from dimensionDetails when older rows lack them.
  let dimensionResults = Array.isArray(scores.dimensionResults) ? scores.dimensionResults : null;
  if (!dimensionResults && scores.dimensionDetails && typeof scores.dimensionDetails === "object") {
    try {
      dimensionResults = toDimensionResults(scores.dimensionDetails as never);
    } catch {
      dimensionResults = null;
    }
  }

  const insights = sanitizePublicInsights(scores.insights);
  const dimensionAnalyses = sanitizePublicDimensionAnalyses(scores.dimensionAnalyses);
  const recommendation = sanitizePublicRecommendation(scores.recommendation);

  const dimScores =
    sanitizeDimensionScores(scores.dimensions) ?? sanitizeDimensionScores(scores.scores);
  const overall = finiteScore(scores.overall);

  return {
    id: submission.id,
    snapshotId: submission.id,
    scores: dimScores,
    dimensions: dimScores,
    dimensionDetails: scores.dimensionDetails ?? null,
    dimensionResults,
    insights,
    dimensionAnalyses,
    recommendation,
    ranges: scores.ranges ?? null,
    displayMode: scores.displayMode ?? "point",
    overall,
    bucket: submission.bucket ?? scores.bucket ?? null,
    // Bound free-text so hero summary / reasoning never ship raw multi-KB paste.
    reasoning:
      typeof scores.reasoning === "string" ? clipPublicText(scores.reasoning, 900) || null : null,
    caveat: typeof scores.caveat === "string" ? clipPublicText(scores.caveat, 480) || null : null,
    findings,
    recommendedEngagement:
      typeof scores.recommendedEngagement === "string" ? scores.recommendedEngagement : null,
    offerKey: typeof scores.offerKey === "string" ? scores.offerKey : "audit",
    ctaLabel:
      typeof scores.ctaLabel === "string" ? scores.ctaLabel : "Apply for the next audit opening",
    pricing: scores.pricing ?? null,
    source: scores.source ?? null,
    contact: submission.contact
      ? {
          name:
            typeof submission.contact.name === "string"
              ? submission.contact.name
              : typeof submission.contact.fullName === "string"
                ? submission.contact.fullName
                : null,
          email: typeof submission.contact.email === "string" ? submission.contact.email : null,
          company:
            typeof submission.contact.company === "string"
              ? submission.contact.company
              : typeof submission.contact.companyName === "string"
                ? submission.contact.companyName
                : null,
        }
      : null,
    // Intentionally omit how-to-fix / remediation keys; bound free-text fields.
    reportSummary: sanitizePublicReportSummary(report),
    createdAt: submission.createdAt,
  };
}

/** Ensure readiness tables exist (bootstrap when formal migrate has not run yet). */
export async function ensureReadinessTables(dbHandle: DatabaseHandle): Promise<void> {
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      token text NOT NULL,
      stage text DEFAULT 'intake' NOT NULL,
      draft jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await dbHandle.sql`
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
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_question_bank (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      question_key text NOT NULL,
      prompt text NOT NULL,
      category text DEFAULT 'general' NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      active boolean DEFAULT true NOT NULL,
      metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_scoring_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      config_key text NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      rules jsonb DEFAULT '{}'::jsonb NOT NULL,
      weights jsonb DEFAULT '{}'::jsonb NOT NULL,
      active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_ingest_tokens (
      token text PRIMARY KEY,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_ingest_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      token text NOT NULL,
      payload jsonb NOT NULL,
      received_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  try {
    // Limited-resubmit token lifecycle: tracks how many times a token has
    // successfully ingested a submission (see INGEST_TOKEN_MAX_USES).
    await dbHandle.sql`ALTER TABLE readiness_ingest_tokens ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0 NOT NULL`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_ingest_tokens_expires_at_idx ON readiness_ingest_tokens (expires_at)`;
  } catch {
    // column/index races are non-fatal
  }
  try {
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_sessions_token_uidx ON readiness_sessions (token)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_sessions_updated_at_idx ON readiness_sessions (updated_at)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_submissions_session_id_idx ON readiness_submissions (session_id)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_submissions_retention_idx ON readiness_submissions (retention_expires_at)`;
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_question_bank_key_uidx ON readiness_question_bank (question_key)`;
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_scoring_config_key_version_uidx ON readiness_scoring_config (config_key, version)`;
  } catch {
    // index races are non-fatal
  }

  // Seed Stage 4 follow-up questions (data-driven bank).
  try {
    await seedReadinessFollowupQuestions(
      dbHandle.db,
      FOLLOWUP_QUESTION_SEED.map((q) => ({
        questionKey: q.questionKey,
        prompt: q.prompt,
        category: q.category,
        sortOrder: q.sortOrder,
        metadata: followupSeedMetadata(q),
      })),
    );
  } catch {
    // seed races are non-fatal
  }

  // Seed Stage 5 scoring config (dimension weights as data).
  // Version tracks DEFAULT_SCORING_CONFIG.version so percentile / rule updates
  // activate on deploy (highest active version wins).
  try {
    await seedReadinessScoringConfig(dbHandle.db, {
      configKey: "default",
      version: 3,
      rules: defaultScoringRulesJson(),
      weights: defaultScoringWeightsJson(),
    });
  } catch {
    // seed races are non-fatal
  }
  // Keep v2 row updated as well for older deploy paths that only seed v2.
  try {
    await seedReadinessScoringConfig(dbHandle.db, {
      configKey: "default",
      version: 2,
      rules: defaultScoringRulesJson(),
      weights: defaultScoringWeightsJson(),
    });
  } catch {
    // seed races are non-fatal
  }

  // Bootstrap briefs table when formal migrate has not run yet.
  await dbHandle.sql`
    CREATE TABLE IF NOT EXISTS readiness_briefs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      submission_id uuid NOT NULL,
      brief jsonb NOT NULL,
      talking_points jsonb DEFAULT '[]'::jsonb NOT NULL,
      score_summary jsonb,
      bucket text,
      discrepancy_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
      llm_polished boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  try {
    await dbHandle.sql`CREATE UNIQUE INDEX IF NOT EXISTS readiness_briefs_submission_uidx ON readiness_briefs (submission_id)`;
    await dbHandle.sql`CREATE INDEX IF NOT EXISTS readiness_briefs_created_at_idx ON readiness_briefs (created_at)`;
  } catch {
    // index races are non-fatal
  }
}

/**
 * After score persistence: build template brief, optional LLM polish (fail closed),
 * store durable brief row, enqueue applicant snapshot + ops brief emails.
 * Never throws — scoring success must not fail because of brief/email issues.
 */
async function finalizeSubmissionSideEffects(
  db: DatabaseHandle["db"],
  options: {
    submissionId: string;
    token: string;
    email: string;
    name: string;
    company: string;
    bucket: string;
    scores: Record<string, unknown>;
    contact: Record<string, unknown>;
    report: Record<string, unknown>;
    draft: Record<string, unknown>;
    discrepancyFlags: unknown[];
    leadNotificationEmail: string;
    publicOrigin: string;
    log: {
      info: (obj: Record<string, unknown>, msg?: string) => void;
      warn: (obj: Record<string, unknown>, msg?: string) => void;
    };
  },
): Promise<{ briefId: string | null; snapshotQueued: boolean; opsBriefQueued: boolean }> {
  let briefId: string | null = null;
  let snapshotQueued = false;
  let opsBriefQueued = false;

  try {
    const stage1 =
      options.draft.stage1 &&
      typeof options.draft.stage1 === "object" &&
      !Array.isArray(options.draft.stage1)
        ? (options.draft.stage1 as Record<string, unknown>)
        : null;
    const followupAnswers =
      options.draft.followupAnswers &&
      typeof options.draft.followupAnswers === "object" &&
      !Array.isArray(options.draft.followupAnswers)
        ? (options.draft.followupAnswers as Record<string, unknown>)
        : null;

    let brief: LeadBrief = buildLeadBrief({
      submissionId: options.submissionId,
      contact: options.contact,
      scores: options.scores,
      bucket: options.bucket,
      discrepancyFlags: options.discrepancyFlags,
      parsedReport: options.report,
      stage1,
      followupAnswers,
      draft: options.draft,
    });

    // Optional LLM polish only when a vault-backed key is present; never block.
    try {
      const polished = await tryLlmPolishBrief(brief, process.env);
      if (polished) {
        brief = { ...polished, llmPolished: true };
      }
    } catch {
      // fail closed to pure template
    }

    const publicBrief = toPublicLeadBrief(brief);
    const stored = await upsertReadinessBrief(db, {
      submissionId: options.submissionId,
      brief: publicBrief,
      talkingPoints: [...brief.talkingPoints],
      scoreSummary: brief.scoreSummary as unknown as Record<string, unknown>,
      bucket: brief.bucket,
      discrepancyFlags: brief.discrepancyFlags,
      llmPolished: brief.llmPolished,
    });
    briefId = stored.id;

    const origin = options.publicOrigin.replace(/\/$/, "") || "https://www.vygo.ai";
    const snapshotUrl = `${origin}/readiness/snapshot?id=${encodeURIComponent(options.submissionId)}`;

    const snapshotText = [
      "Your vygo readiness snapshot is ready.",
      "",
      `Bucket: ${options.bucket || "—"}`,
      options.name ? `Hi ${options.name},` : "",
      `View online: ${snapshotUrl}`,
      "",
      typeof options.scores.reasoning === "string" ? options.scores.reasoning : "",
      "",
      "This email was sent because you completed a readiness check on vygo.ai.",
    ]
      .filter(Boolean)
      .join("\n");

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const snapshotHtml = [
      "<p>Your <strong>vygo</strong> readiness snapshot is ready.</p>",
      options.name ? `<p>Hi ${esc(options.name)},</p>` : "",
      `<p><strong>Bucket:</strong> ${esc(options.bucket || "—")}</p>`,
      `<p><a href="${esc(snapshotUrl)}">Open your snapshot</a></p>`,
      '<p style="color:#64748b;font-size:12px;">Sent because you completed a readiness check on vygo.ai.</p>',
    ]
      .filter(Boolean)
      .join("");

    await enqueueReadinessSnapshotEmail(db, {
      snapshotId: options.submissionId,
      email: options.email,
      snapshotUrl,
      subject: "Your vygo readiness snapshot",
      html: snapshotHtml,
      text: snapshotText,
      bucket: options.bucket || null,
      name: options.name || null,
    });
    snapshotQueued = true;

    const opsRecipient =
      (options.leadNotificationEmail || "hello@vygo.ai").trim().toLowerCase() || "hello@vygo.ai";
    const opsPayload: ReadinessOpsBriefPayload = {
      submissionId: options.submissionId,
      briefId: stored.id,
      brief: publicBrief,
    };
    let opsHtml: string | undefined;
    let opsText: string | undefined;
    let opsSubject: string | undefined;
    try {
      const rendered = await renderReadinessOpsBrief(opsPayload);
      opsHtml = rendered.html;
      opsText = rendered.text;
      opsSubject = rendered.subject;
    } catch {
      // Worker can re-render from structured brief payload.
    }

    await enqueueReadinessOpsBriefEmail(db, {
      submissionId: options.submissionId,
      briefId: stored.id,
      recipient: opsRecipient,
      brief: publicBrief,
      subject: opsSubject,
      html: opsHtml,
      text: opsText,
    });
    opsBriefQueued = true;

    options.log.info(
      {
        event: "readiness_brief_finalized",
        submissionId: options.submissionId,
        briefId: stored.id,
        snapshotQueued,
        opsBriefQueued,
        llmPolished: brief.llmPolished,
      },
      "readiness brief stored and emails enqueued",
    );
  } catch (error) {
    options.log.warn(
      {
        event: "readiness_brief_finalize_failed",
        submissionId: options.submissionId,
        // Never log secrets or full error bodies with PII.
        reason: error instanceof Error ? error.message.slice(0, 200) : "finalize_failed",
      },
      "brief/email finalize failed (non-blocking)",
    );
  }

  return { briefId, snapshotQueued, opsBriefQueued };
}

async function enforceScorePreviewRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessScorePreviewIpRateLimitKey(ipHashResult.hash);
  } else {
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-score-preview-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessScorePreviewIpRateLimitKey(`rlfb:${digest}`);
  }
  const result = await checkRateLimit(
    deps.rateLimitStore,
    bucketKey,
    SCORE_PREVIEW_RL_LIMIT,
    SCORE_PREVIEW_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(
        result.retryAfterSeconds || SCORE_PREVIEW_RL_WINDOW_SECONDS,
        SCORE_PREVIEW_RL_WINDOW_SECONDS,
      ),
    );
    request.log.info(
      { event: "readiness_score_preview_rate_limited", retryAfterSeconds: retryAfter },
      "rate limited",
    );
    reply.header("Retry-After", String(retryAfter));
    reply.status(429).send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

async function enforceScoreRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessScoreIpRateLimitKey(ipHashResult.hash);
  } else {
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-score-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessScoreIpRateLimitKey(`rlfb:${digest}`);
  }
  const result = await checkRateLimit(
    deps.rateLimitStore,
    bucketKey,
    SCORE_RL_LIMIT,
    SCORE_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(result.retryAfterSeconds || SCORE_RL_WINDOW_SECONDS, SCORE_RL_WINDOW_SECONDS),
    );
    request.log.info(
      { event: "readiness_score_rate_limited", retryAfterSeconds: retryAfter },
      "rate limited",
    );
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

function isJsonContentType(header: string | string[] | undefined): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return false;
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "application/json";
}

function parseTokenParam(params: unknown): string | null {
  if (params == null || typeof params !== "object") return null;
  const token = (params as { token?: unknown }).token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed || !TOKEN_RE.test(trimmed)) return null;
  return trimmed;
}

function parseSessionBody(
  body: unknown,
):
  | { ok: true; stage?: string; draft?: Record<string, unknown> }
  | { ok: false; status: number; error: ReturnType<typeof safeError> } {
  // Empty body is fine for create; PATCH may send {}.
  if (body == null || body === "") {
    return { ok: true };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: safeError("BAD_REQUEST", "Request body must be a JSON object."),
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
        error: safeError("VALIDATION_ERROR", "stage must be a string."),
      };
    }
    stage = record.stage;
  }

  if (record.draft !== undefined) {
    if (record.draft == null || typeof record.draft !== "object" || Array.isArray(record.draft)) {
      return {
        ok: false,
        status: 400,
        error: safeError("VALIDATION_ERROR", "draft must be a JSON object."),
      };
    }
    draft = record.draft as Record<string, unknown>;
  }

  return { ok: true, stage, draft };
}

/**
 * Rate-limit readiness endpoints by client IP (single readiness-only bucket).
 * Shared across create/GET/PATCH so a multi-step session cannot be half-blocked.
 * Uses salted IP hash when configured; otherwise a non-stored HMAC bucket so
 * limits still apply without logging or persisting raw IPs.
 */
async function enforceReadinessRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  const limit = READINESS_RL_LIMIT;
  const windowSeconds = READINESS_RL_WINDOW_SECONDS;

  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessIpRateLimitKey(ipHashResult.hash);
  } else {
    // Fall back: bucket by HMAC of IP with a fixed pepper (key only — not stored as PII).
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessIpRateLimitKey(`rlfb:${digest}`);
  }

  const result = await checkRateLimit(deps.rateLimitStore, bucketKey, limit, windowSeconds);

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(result.retryAfterSeconds || windowSeconds, windowSeconds),
    );
    request.log.info(
      { event: "readiness_rate_limited", retryAfterSeconds: retryAfter },
      "rate limited",
    );
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

/**
 * Rate-limit run starts by client IP (own generous bucket). The mission's real
 * abuse ceiling is the per-user daily/concurrent limits below; this IP bucket
 * is a defense-in-depth cap that never shares the interactive 20/60s budget so
 * a legitimate multi-project start burst is never starved.
 */
async function enforceRunStartIpRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);
  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessRunStartIpRateLimitKey(ipHashResult.hash);
  } else {
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-start-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessRunStartIpRateLimitKey(`rlfb:${digest}`);
  }
  const result = await checkRateLimit(
    deps.rateLimitStore,
    bucketKey,
    RUN_START_IP_RL_LIMIT,
    RUN_START_IP_RL_WINDOW_SECONDS,
  );
  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(
        result.retryAfterSeconds || RUN_START_IP_RL_WINDOW_SECONDS,
        RUN_START_IP_RL_WINDOW_SECONDS,
      ),
    );
    await reply.status(429).header("Retry-After", String(retryAfter)).send({
      error: "rate_limited",
      code: "RATE_LIMITED",
      message: "Too many run starts from this client. Please try again later.",
    });
    return false;
  }
  return true;
}

/**
 * Rate-limit the readiness status poll endpoint by client IP (own bucket).
 * Read-only, called on an interval by the waiting readiness page, so the limit
 * sits well above normal poll cadence while still bounding abuse.
 */
async function enforceStatusRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ReadinessRouteDeps,
): Promise<boolean> {
  const rawIp = resolveClientIp(request);
  const ipHashResult = hashIpAddress(rawIp, deps.env);

  let bucketKey: string;
  if (ipHashResult) {
    bucketKey = readinessStatusIpRateLimitKey(ipHashResult.hash);
  } else {
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "vygo-readiness-status-rl")
      .update(rawIp)
      .digest("hex")
      .slice(0, 32);
    bucketKey = readinessStatusIpRateLimitKey(`rlfb:${digest}`);
  }

  const result = await checkRateLimit(
    deps.rateLimitStore,
    bucketKey,
    STATUS_RL_LIMIT,
    STATUS_RL_WINDOW_SECONDS,
  );

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.min(result.retryAfterSeconds || STATUS_RL_WINDOW_SECONDS, STATUS_RL_WINDOW_SECONDS),
    );
    request.log.info(
      { event: "readiness_status_rate_limited", retryAfterSeconds: retryAfter },
      "rate limited",
    );
    await reply
      .status(429)
      .header("Retry-After", String(retryAfter))
      .send(safeError("RATE_LIMITED", "Too many attempts. Please try again later."));
    return false;
  }
  return true;
}

export function registerReadinessRoutes(app: FastifyInstance, deps: ReadinessRouteDeps): void {
  app.post("/v1/readiness/session", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    // Content-Type optional when body empty; when present must be JSON.
    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const parsed = parseSessionBody(request.body ?? {});
    if (!parsed.ok) {
      return reply.status(parsed.status).send(parsed.error);
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await createReadinessSession(dbHandle.db, {
        stage: parsed.stage,
        draft: parsed.draft,
      });
      return reply.status(201).send(session);
    } catch (error) {
      request.log.error(
        { event: "readiness_session_create_failed" },
        error instanceof Error ? error.message : "create failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.get("/v1/readiness/session/:token", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const token = parseTokenParam(request.params);
    if (!token) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid session token."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await findReadinessSessionByToken(dbHandle.db, token);
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }
      return reply.status(200).send(session);
    } catch (error) {
      request.log.error(
        { event: "readiness_session_get_failed" },
        error instanceof Error ? error.message : "get failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.patch("/v1/readiness/session/:token", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const token = parseTokenParam(request.params);
    if (!token) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid session token."));
    }

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const parsed = parseSessionBody(request.body);
    if (!parsed.ok) {
      return reply.status(parsed.status).send(parsed.error);
    }

    if (parsed.stage === undefined && parsed.draft === undefined) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "Provide stage and/or draft to update."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await patchReadinessSessionByToken(dbHandle.db, token, {
        stage: parsed.stage,
        draft: parsed.draft,
      });
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }
      return reply.status(200).send(session);
    } catch (error) {
      request.log.error(
        { event: "readiness_session_patch_failed" },
        error instanceof Error ? error.message : "patch failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.post("/v1/readiness/lead", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reasonRaw || reasonRaw.length > 64) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "reason is required (max 64 chars)."));
    }
    const token =
      typeof body.token === "string" && body.token.trim() ? body.token.trim().slice(0, 128) : null;
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim().toLowerCase().slice(0, 254)
        : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "Invalid email address."));
    }
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : null;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const result = await logReadinessLead(dbHandle.db, {
        token,
        reason: reasonRaw,
        answers,
        email,
      });
      request.log.info(
        { event: "readiness_lead_logged", reason: reasonRaw, hasToken: Boolean(token) },
        "readiness lead logged",
      );
      return reply.status(201).send({ accepted: true, id: result.id });
    } catch (error) {
      request.log.error(
        { event: "readiness_lead_failed" },
        error instanceof Error ? error.message : "lead failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.post("/v1/readiness/email-prompt", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 50_000) : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "A valid email is required."));
    }
    if (!token || !TOKEN_RE.test(token)) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }
    if (!prompt || prompt.trim().length < 20) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "prompt is required."));
    }

    const origin =
      (deps.env as { PUBLIC_WEB_ORIGIN?: string }).PUBLIC_WEB_ORIGIN?.trim() ||
      "https://www.vygo.ai";
    const resumeUrl = `${origin.replace(/\/$/, "")}/readiness?token=${encodeURIComponent(token)}`;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const result = await enqueueReadinessPromptEmail(dbHandle.db, {
        email,
        token,
        prompt,
        resumeUrl,
      });
      request.log.info(
        { event: "readiness_prompt_email_queued", hasToken: true },
        "readiness prompt email queued",
      );
      return reply.status(202).send({
        accepted: true,
        queued: true,
        resumeUrl,
        idempotencyKey: result.idempotencyKey,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_email_prompt_failed" },
        error instanceof Error ? error.message : "email prompt failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Stage 3 paste-back parse.
   * Server runs the same secret scan, REDACTS hits to [REDACTED] before storage
   * and before any optional LLM call, then deterministic-parses. Never blocks
   * the feature on a missing LLM key — fails closed to deterministic / manual.
   */
  app.post(
    "/v1/readiness/parse",
    {
      // Pastes can exceed the default 64 KiB body budget.
      bodyLimit: 128 * 1024,
    },
    async (request, reply) => {
      if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

      if (!isJsonContentType(request.headers["content-type"])) {
        return reply
          .status(415)
          .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
      const paste = typeof body.paste === "string" ? body.paste.slice(0, 100_000) : "";
      if (!token || !TOKEN_RE.test(token)) {
        return reply
          .status(400)
          .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
      }
      if (!paste || paste.trim().length < 8) {
        return reply.status(400).send(safeError("VALIDATION_ERROR", "paste is required."));
      }

      const dbHandle = deps.getDb();
      if (!dbHandle) {
        return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
      }

      try {
        await ensureReadinessTables(dbHandle);
        const session = await findReadinessSessionByToken(dbHandle.db, token);
        if (!session) {
          return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
        }

        // Same secret scan as client; REDACT (do not reject) before storage/LLM.
        const redaction = redactPasteSecrets(paste);
        if (redaction.didRedact || !redaction.scan.clean) {
          request.log.info(
            {
              event: "readiness_paste_redacted",
              hitCount: redaction.scan.hits.length,
              kinds: redaction.scan.hits.map((h) => h.kind),
              lines: redaction.scan.lines,
              replacementCount: redaction.replacementCount,
            },
            "readiness paste secrets redacted",
          );
        }

        // Defense in depth: also run durable env/connection-string redactor.
        const redacted = redactSensitivePaste(redaction.redacted).slice(0, 50_000);

        // Optional LLM only after redaction; fail closed when no key.
        let llmReport: Awaited<ReturnType<typeof tryLlmNormalizeReport>> = null;
        try {
          llmReport = await tryLlmNormalizeReport(redacted, process.env);
        } catch {
          llmReport = null;
        }

        const pipeline = runDeterministicParse(redacted);
        const finalReport = (llmReport ?? pipeline.report) as ReadinessReportV1Partial;
        const parseStatus = llmReport ? "ok" : pipeline.parseStatus;
        const routeToManual = llmReport ? false : pipeline.routeToManual;
        const stage = routeToManual ? "manual" : "confirm";

        const draft = {
          ...session.draft,
          pasteText: redacted,
          rawPasteRedacted: redacted,
          source: "paste",
          report: finalReport as Record<string, unknown>,
          parseStatus,
          routeToManual,
          parseSource: llmReport ? "llm" : pipeline.source,
          parseUpdatedAt: new Date().toISOString(),
          redaction: {
            didRedact: redaction.didRedact || !redaction.scan.clean,
            hitCount: redaction.scan.hits.length,
            kinds: redaction.scan.hits.map((h) => h.kind),
          },
        };

        const updated = await patchReadinessSessionByToken(dbHandle.db, token, {
          stage,
          draft,
        });

        let submissionId: string | null = null;
        try {
          const rows = await dbHandle.sql<{ id: string }[]>`
            SELECT id FROM readiness_sessions WHERE token = ${token} LIMIT 1
          `;
          const sessionId = rows[0]?.id ?? null;
          const inserted = await insertReadinessSubmission(dbHandle.db, {
            sessionId,
            parsedReport: finalReport as Record<string, unknown>,
            rawPasteRedacted: redacted,
            bucket: `paste:${parseStatus}`,
            discrepancyFlags: [],
            contact: {
              source: "readiness_paste",
              parseStatus,
              routeToManual,
              redacted: draft.redaction,
            },
          });
          submissionId = inserted.id;
          if (updated) {
            await patchReadinessSessionByToken(dbHandle.db, token, {
              draft: { ...draft, submissionId },
            });
          }
        } catch {
          // non-fatal — draft is the source of truth for resume
        }

        request.log.info(
          {
            event: "readiness_parse",
            parseStatus,
            routeToManual,
            hasFindings: pipeline.findings.length > 0,
            redacted: draft.redaction.didRedact,
          },
          "readiness paste parsed",
        );

        // Response must never echo unredacted secrets (use redacted report only).
        return reply.status(200).send({
          token,
          stage: updated?.stage ?? stage,
          parseStatus,
          routeToManual,
          stack: pipeline.stack,
          size: pipeline.size,
          findings: pipeline.findings,
          report: finalReport,
          submissionId,
          draft: {
            ...(updated?.draft ?? draft),
            pasteText: redacted,
            rawPasteRedacted: redacted,
          },
        });
      } catch (error) {
        request.log.error(
          { event: "readiness_parse_failed" },
          error instanceof Error ? error.message : "parse failed",
        );
        return reply
          .status(500)
          .send(
            safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."),
          );
      }
    },
  );

  /**
   * Stage 4: return dynamic follow-up questions from readiness_question_bank
   * (seeded), filtered by parsed-report trigger conditions.
   */
  app.post("/v1/readiness/followups", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    if (!token || !TOKEN_RE.test(token)) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await findReadinessSessionByToken(dbHandle.db, token);
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }

      const report =
        session.draft.report &&
        typeof session.draft.report === "object" &&
        !Array.isArray(session.draft.report)
          ? (session.draft.report as ReadinessReportV1Partial)
          : body.report && typeof body.report === "object" && !Array.isArray(body.report)
            ? (body.report as ReadinessReportV1Partial)
            : {};

      let bank: Awaited<ReturnType<typeof listReadinessQuestionBank>> = [];
      try {
        bank = await listReadinessQuestionBank(dbHandle.db);
      } catch {
        bank = [];
      }

      const questions = selectFollowupQuestions(
        report,
        bank.map((row) => ({
          questionKey: row.questionKey,
          prompt: row.prompt,
          category: row.category,
          sortOrder: row.sortOrder,
          active: row.active,
          metadata: row.metadata,
        })),
      );

      request.log.info(
        { event: "readiness_followups", count: questions.length },
        "readiness follow-ups selected",
      );

      return reply.status(200).send({
        token,
        source: bank.length > 0 ? "readiness_question_bank" : "seed",
        questions,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_followups_failed" },
        error instanceof Error ? error.message : "followups failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Stage 4 answer submit. Contradictions vs the parsed report set an INTERNAL
   * discrepancy flag on the submission — never returned in this user-facing body.
   */
  app.post("/v1/readiness/followups/answer", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : null;
    if (!token || !TOKEN_RE.test(token)) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }
    if (!answers || Object.keys(answers).length === 0) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "answers are required."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await findReadinessSessionByToken(dbHandle.db, token);
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }

      const report =
        session.draft.report &&
        typeof session.draft.report === "object" &&
        !Array.isArray(session.draft.report)
          ? (session.draft.report as ReadinessReportV1Partial)
          : {};

      const flags = detectFollowupDiscrepancies(report, answers);
      await appendSubmissionDiscrepancyFlags(dbHandle.db, token, flags, answers);

      request.log.info(
        {
          event: "readiness_followups_answered",
          answerKeys: Object.keys(answers).length,
          // Log count only — never surface flag details to clients here.
          discrepancyCount: flags.length,
        },
        "readiness follow-up answers stored",
      );

      // User-facing response intentionally omits discrepancy flags.
      return reply.status(200).send({
        token,
        accepted: true,
        stage: "followups",
        savedKeys: Object.keys(answers),
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_followups_answer_failed" },
        error instanceof Error ? error.message : "followups answer failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Authenticated-by-session-token read-back of the stored submission.
   * Exposes redacted paste + discrepancy flags for live verification.
   * Never returns unredacted secrets.
   */
  app.get("/v1/readiness/submission", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const q = request.query as Record<string, unknown>;
    const token = typeof q.token === "string" ? q.token.trim().slice(0, 128) : "";
    if (!token || !TOKEN_RE.test(token)) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const submission = await findLatestSubmissionBySessionToken(dbHandle.db, token);
      if (!submission) {
        return reply.status(404).send(safeError("NOT_FOUND", "Submission not found."));
      }

      // Hard-guard: never echo high-confidence secret shapes if any slipped through.
      const paste = submission.rawPasteRedacted ?? "";
      const recheck = redactPasteSecrets(paste);
      const safePaste = recheck.redacted;

      const brief = await findReadinessBriefBySubmissionId(dbHandle.db, submission.id);
      const contactEmail =
        submission.contact && typeof submission.contact.email === "string"
          ? submission.contact.email
          : null;
      const outbox = await listReadinessOutboxJobs(dbHandle.db, {
        submissionId: submission.id,
        token,
        email: contactEmail,
      });

      return reply.status(200).send({
        id: submission.id,
        token: submission.sessionToken,
        parsedReport: submission.parsedReport,
        rawPasteRedacted: safePaste,
        scores: submission.scores,
        discrepancyFlags: submission.discrepancyFlags,
        bucket: submission.bucket,
        contact: submission.contact,
        createdAt: submission.createdAt,
        // Linked internal brief (template-first; includes talking points + score summary).
        brief: brief
          ? {
              id: brief.id,
              submissionId: brief.submissionId,
              talkingPoints: brief.talkingPoints,
              scoreSummary: brief.scoreSummary,
              bucket: brief.bucket,
              discrepancyFlags: brief.discrepancyFlags,
              llmPolished: brief.llmPolished,
              // Full structured brief body for ops verification (no secrets).
              body: brief.brief,
              createdAt: brief.createdAt,
            }
          : null,
        // Queryable outbox jobs for this submission (snapshot + ops brief + prompt).
        outbox,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_submission_read_failed" },
        error instanceof Error ? error.message : "submission read failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Query durable internal brief by submission id (or session token).
   * Used by live verification; never returns secrets.
   */
  app.get("/v1/readiness/brief", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const q = request.query as Record<string, unknown>;
    const submissionId =
      typeof q.submissionId === "string"
        ? q.submissionId.trim()
        : typeof q.id === "string"
          ? q.id.trim()
          : "";
    const token = typeof q.token === "string" ? q.token.trim().slice(0, 128) : "";

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      let resolvedSubmissionId = submissionId;
      if (
        (!resolvedSubmissionId || !UUID_RE.test(resolvedSubmissionId)) &&
        token &&
        TOKEN_RE.test(token)
      ) {
        const submission = await findLatestSubmissionBySessionToken(dbHandle.db, token);
        if (!submission) {
          return reply.status(404).send(safeError("NOT_FOUND", "Submission not found."));
        }
        resolvedSubmissionId = submission.id;
      }
      if (!resolvedSubmissionId || !UUID_RE.test(resolvedSubmissionId)) {
        return reply
          .status(400)
          .send(safeError("VALIDATION_ERROR", "Provide submissionId or token."));
      }

      const brief = await findReadinessBriefBySubmissionId(dbHandle.db, resolvedSubmissionId);
      if (!brief) {
        return reply.status(404).send(safeError("NOT_FOUND", "Brief not found."));
      }

      return reply.status(200).send({
        id: brief.id,
        submissionId: brief.submissionId,
        talkingPoints: brief.talkingPoints,
        scoreSummary: brief.scoreSummary,
        bucket: brief.bucket,
        discrepancyFlags: brief.discrepancyFlags,
        llmPolished: brief.llmPolished,
        body: brief.brief,
        createdAt: brief.createdAt,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_brief_read_failed" },
        error instanceof Error ? error.message : "brief read failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Dry-run scoring for automated verification and later UI layers.
   * Accepts assessment answers (or a built-in weak/strong profile) and returns
   * the same mission-shaped dimensionResults payload as a real score — without
   * Turnstile, lead capture, email, or persistence.
   */
  app.post("/v1/readiness/score-preview", async (request, reply) => {
    if (!(await enforceScorePreviewRateLimit(request, reply, deps))) return;
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const resolved = resolveScorePreviewReport(body);
    if (!resolved) {
      return reply
        .status(400)
        .send(
          safeError(
            "VALIDATION_ERROR",
            'Provide assessment answers as `report` or `answers`, or a built-in `profile` of "weak", "strong", or "mixed".',
          ),
        );
    }

    const report = stripPreviewContactKeys(resolved.report);
    if (Object.keys(report).length === 0) {
      return reply
        .status(400)
        .send(
          safeError(
            "VALIDATION_ERROR",
            "Assessment answers must include at least one scored field.",
          ),
        );
    }

    try {
      // Prefer active DB config when available; fall back to DEFAULT (pure compute).
      let scoringConfig = null as ReturnType<typeof scoringConfigFromDbRow> | null;
      const dbHandle = deps.getDb();
      if (dbHandle) {
        try {
          await ensureReadinessTables(dbHandle);
          const configRow = await getActiveReadinessScoringConfig(dbHandle.db, "default");
          scoringConfig = scoringConfigFromDbRow(configRow);
        } catch {
          scoringConfig = null;
        }
      }

      const stage1 =
        body.stage1 && typeof body.stage1 === "object" && !Array.isArray(body.stage1)
          ? (body.stage1 as Partial<ReadinessStage1Answers>)
          : null;
      const followups =
        body.followups && typeof body.followups === "object" && !Array.isArray(body.followups)
          ? (body.followups as Record<string, unknown>)
          : null;

      const payload = computeReadinessScore({
        report,
        source: resolved.source,
        stage1,
        followups,
        config: scoringConfig,
      });

      request.log.info(
        {
          event: "readiness_score_preview",
          profile: resolved.profile,
          source: resolved.source,
          overall: payload.overall,
          bucket: payload.bucket,
        },
        "readiness score preview",
      );

      return reply.status(200).send(publicScorePreviewBody(payload, { profile: resolved.profile }));
    } catch (error) {
      request.log.error(
        { event: "readiness_score_preview_failed" },
        error instanceof Error ? error.message : "score preview failed",
      );
      return reply
        .status(500)
        .send(
          safeError("SCORING_UNAVAILABLE", "Scoring engine failed closed. Please try again later."),
        );
    }
  });

  /**
   * Stage 5: email gate + score. Requires name, email, privacy consent.
   * Reuses Turnstile (no new CAPTCHA). Persists scores, bucket, reasoning.
   * Redacts secret-shaped free text before storage.
   */
  app.post("/v1/readiness/score", async (request, reply) => {
    if (!(await enforceScoreRateLimit(request, reply, deps))) return;
    // Also count against shared readiness budget.
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    const name =
      typeof body.name === "string"
        ? body.name.trim().slice(0, 120)
        : typeof body.fullName === "string"
          ? body.fullName.trim().slice(0, 120)
          : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const company =
      typeof body.company === "string"
        ? body.company.trim().slice(0, 160)
        : typeof body.companyName === "string"
          ? body.companyName.trim().slice(0, 160)
          : "";
    const privacyAccepted =
      body.privacyAccepted === true || body.privacyConsent === true || body.consent === true;
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : undefined;

    if (!token || !TOKEN_RE.test(token)) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A valid session token is required."));
    }

    const fieldErrors: Record<string, string> = {};
    if (!name || name.length < 1) fieldErrors.name = "Name is required.";
    if (!email || !isEmailLike(email)) fieldErrors.email = "A valid email is required.";
    if (!privacyAccepted) fieldErrors.privacyAccepted = "Privacy consent is required.";

    if (Object.keys(fieldErrors).length > 0) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Name, email, and privacy consent are required before scored results.",
          fields: fieldErrors,
        },
      });
    }

    const rawIp = resolveClientIp(request);
    const e2eBypass = isReadinessE2ETurnstileBypass(request, body, email, turnstileToken);
    if (!e2eBypass) {
      const turnstileResult = await deps.turnstile.verify(turnstileToken, rawIp);
      if (!turnstileResult.success) {
        request.log.info(
          { event: "readiness_score_turnstile_failed", reason: turnstileResult.reason },
          "turnstile failed",
        );
        return reply
          .status(400)
          .send(safeError("TURNSTILE_FAILED", "Verification failed. Please try again."));
      }
    } else {
      request.log.info(
        { event: "readiness_score_e2e_turnstile_bypassed" },
        "readiness e2e turnstile bypass",
      );
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const session = await findReadinessSessionByToken(dbHandle.db, token);
      if (!session) {
        return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
      }

      const draft = session.draft;

      // Idempotent re-submit: return the existing successful snapshot rather than duplicating.
      // Failed scoring payloads are NOT treated as already-submitted so the user can retry.
      const existingSubmissionId =
        typeof draft.submissionId === "string" ? draft.submissionId.trim() : "";
      if (
        (session.stage === "scored" || draft.scoredAt) &&
        existingSubmissionId &&
        !existingSubmissionId.startsWith("draft:")
      ) {
        const existing = await findReadinessSubmissionById(dbHandle.db, existingSubmissionId);
        const existingScores =
          existing?.scores && typeof existing.scores === "object"
            ? (existing.scores as Record<string, unknown>)
            : null;
        if (
          existing &&
          existingScores &&
          existingScores.scoringFailed !== true &&
          finiteScore(existingScores.overall) != null
        ) {
          const bodyOut = publicSnapshotBody({
            id: existing.id,
            scores: existingScores,
            bucket: existing.bucket,
            contact: existing.contact as Record<string, unknown> | null,
            parsedReport: existing.parsedReport as Record<string, unknown> | null,
            createdAt: existing.createdAt,
          });
          request.log.info(
            { event: "readiness_score_already_submitted", snapshotId: existing.id },
            "readiness score idempotent replay",
          );
          return reply.status(200).send({
            ...bodyOut,
            alreadySubmitted: true,
            snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(existing.id)}`,
          });
        }
      }

      // Also catch race/replay when a scored submission row already exists for this session.
      const latest = await findLatestSubmissionBySessionToken(dbHandle.db, token);
      const latestScores =
        latest?.scores && typeof latest.scores === "object"
          ? (latest.scores as Record<string, unknown>)
          : null;
      if (
        latest &&
        !String(latest.id).startsWith("draft:") &&
        latestScores &&
        latestScores.scoringFailed !== true &&
        finiteScore(latestScores.overall) != null
      ) {
        const bodyOut = publicSnapshotBody({
          id: latest.id,
          scores: latestScores,
          bucket: latest.bucket,
          contact: latest.contact as Record<string, unknown> | null,
          parsedReport: latest.parsedReport as Record<string, unknown> | null,
          createdAt: latest.createdAt,
        });
        request.log.info(
          { event: "readiness_score_already_submitted", snapshotId: latest.id },
          "readiness score idempotent replay (latest)",
        );
        return reply.status(200).send({
          ...bodyOut,
          alreadySubmitted: true,
          snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(latest.id)}`,
        });
      }

      const sourceRaw =
        typeof draft.source === "string"
          ? draft.source
          : typeof body.source === "string"
            ? body.source
            : "paste";
      const source = sourceRaw === "manual" ? "manual" : "paste";

      let report: Record<string, unknown> = {};
      if (draft.report && typeof draft.report === "object" && !Array.isArray(draft.report)) {
        report = { ...(draft.report as Record<string, unknown>) };
      } else if (
        draft.manualAnswers &&
        typeof draft.manualAnswers === "object" &&
        !Array.isArray(draft.manualAnswers)
      ) {
        report = manualAnswersToReport(draft.manualAnswers as never) as Record<string, unknown>;
      } else if (body.report && typeof body.report === "object" && !Array.isArray(body.report)) {
        report = { ...(body.report as Record<string, unknown>) };
      }

      // Fallback: re-parse paste text when a partial session PATCH wiped report
      // but left pasteText / rawPasteRedacted (common race before draft merge).
      if (!hasScorableReportAnswers(report)) {
        const pasteFallback =
          (typeof draft.rawPasteRedacted === "string" && draft.rawPasteRedacted) ||
          (typeof draft.pasteText === "string" && draft.pasteText) ||
          (typeof body.paste === "string" && body.paste) ||
          "";
        if (pasteFallback.trim()) {
          try {
            const recovered = parseReadinessPastePartial(pasteFallback) as Record<string, unknown>;
            if (hasScorableReportAnswers(recovered)) {
              report = recovered;
              request.log.info(
                { event: "readiness_score_report_recovered_from_paste" },
                "recovered report from pasteText after missing draft.report",
              );
            }
          } catch {
            /* keep empty report → fail closed below */
          }
        }
      }

      // Deep-redact free-text report fields before scoring/storage.
      report = redactReportDeep(report);

      let pasteRedacted: string | null =
        typeof draft.rawPasteRedacted === "string"
          ? draft.rawPasteRedacted
          : typeof draft.pasteText === "string"
            ? draft.pasteText
            : null;
      if (pasteRedacted) {
        pasteRedacted = redactSensitivePaste(redactPasteSecrets(pasteRedacted).redacted);
      }
      if (typeof body.paste === "string" && body.paste.trim()) {
        pasteRedacted = redactSensitivePaste(redactPasteSecrets(body.paste).redacted).slice(
          0,
          50_000,
        );
      }

      const stage1 =
        draft.stage1 && typeof draft.stage1 === "object" && !Array.isArray(draft.stage1)
          ? (draft.stage1 as Partial<ReadinessStage1Answers>)
          : null;
      const followups =
        draft.followupAnswers &&
        typeof draft.followupAnswers === "object" &&
        !Array.isArray(draft.followupAnswers)
          ? (draft.followupAnswers as Record<string, unknown>)
          : null;

      let configRow = null;
      try {
        configRow = await getActiveReadinessScoringConfig(dbHandle.db, "default");
      } catch {
        configRow = null;
      }
      const scoringConfig = scoringConfigFromDbRow(configRow);

      // Empty OR junk/unrecognized answer payload: fail closed (no silent all-25 baseline).
      // Only recognized scoring/report fields count — arbitrary keys like {totally:'wrong'}
      // must not produce a normal scorecard.
      if (!hasScorableReportAnswers(report, scoringConfig)) {
        const contactFail: Record<string, unknown> = {
          source: e2eBypass ? "readiness_score_gate_e2e" : "readiness_score_gate",
          name,
          fullName: name,
          email,
          privacyAccepted: true,
          gatedAt: new Date().toISOString(),
          ...(e2eBypass ? { e2e: true } : {}),
        };
        if (company) {
          contactFail.company = company;
          contactFail.companyName = company;
        }
        const failScores: Record<string, unknown> = {
          scoringFailed: true,
          errorCode: "SCORING_FAILED",
          errorMessage:
            "Assessment answers were missing or malformed; no readiness score was computed.",
        };
        const savedFail = await persistReadinessScore(dbHandle.db, {
          token,
          scores: failScores,
          bucket: "Launch",
          contact: contactFail,
          parsedReport: report,
          rawPasteRedacted: null,
          discrepancyFlags: Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [],
        });
        request.log.info(
          { event: "readiness_score_failed_validation", snapshotId: savedFail.id },
          "readiness scoring failed: empty/malformed answers",
        );
        return reply.status(200).send({
          ...publicSnapshotBody({
            id: savedFail.id,
            scores: failScores,
            bucket: null,
            contact: contactFail,
            parsedReport: report,
            createdAt: savedFail.createdAt,
          }),
          snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(savedFail.id)}`,
          scoringFailed: true,
          errorCode: "SCORING_FAILED",
          errorMessage:
            "Assessment answers were missing or malformed; no readiness score was computed.",
        });
      }

      let payload: ReadinessScorePayload;
      try {
        payload = computeReadinessScore({
          report,
          source,
          stage1,
          followups,
          config: scoringConfig,
        });
      } catch (scoreErr) {
        request.log.error(
          { event: "readiness_score_engine_failed" },
          scoreErr instanceof Error ? scoreErr.message : "score engine failed",
        );
        return reply
          .status(500)
          .send(
            safeError(
              "SCORING_FAILED",
              "We could not compute a readiness score from this submission. Please try again with complete answers.",
            ),
          );
      }

      // Never persist or return non-finite scores (NaN / Infinity).
      if (!Number.isFinite(payload.overall)) {
        return reply
          .status(500)
          .send(
            safeError(
              "SCORING_FAILED",
              "Scoring produced an invalid result. No fallback score was substituted.",
            ),
          );
      }
      for (const v of Object.values(payload.dimensions ?? {})) {
        if (typeof v !== "number" || !Number.isFinite(v)) {
          return reply
            .status(500)
            .send(
              safeError(
                "SCORING_FAILED",
                "Scoring produced an invalid dimension result. No fallback score was substituted.",
              ),
            );
        }
      }

      // Persist full score payload (includes reasoning) on submission row.
      const scoresJson: Record<string, unknown> = {
        ...payload,
        dimensions: payload.dimensions,
        reasoning: payload.reasoning,
        findings: payload.findings,
        bucket: payload.bucket,
        insights: sanitizePublicInsights(payload.insights),
      };

      const contact: Record<string, unknown> = {
        source: e2eBypass ? "readiness_score_gate_e2e" : "readiness_score_gate",
        name,
        fullName: name,
        email,
        privacyAccepted: true,
        gatedAt: new Date().toISOString(),
        ...(e2eBypass ? { e2e: true } : {}),
      };
      if (company) {
        contact.company = company;
        contact.companyName = company;
      }

      const saved = await persistReadinessScore(dbHandle.db, {
        token,
        scores: scoresJson,
        bucket: payload.bucket,
        contact,
        parsedReport: report,
        rawPasteRedacted: pasteRedacted,
        discrepancyFlags: Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [],
      });

      // Template brief + dual email enqueue (applicant snapshot + ops brief).
      // Fail closed on missing LLM; never block the scored response.
      // E2E path skips email side-effects so automation does not spam Resend.
      const origin =
        (deps.env as { PUBLIC_WEB_ORIGIN?: string }).PUBLIC_WEB_ORIGIN?.trim() ||
        "https://www.vygo.ai";
      const side = e2eBypass
        ? { briefId: null as string | null, snapshotQueued: false, opsBriefQueued: false }
        : await finalizeSubmissionSideEffects(dbHandle.db, {
            submissionId: saved.id,
            token,
            email,
            name,
            company,
            bucket: payload.bucket,
            scores: scoresJson,
            contact,
            report,
            draft,
            discrepancyFlags: Array.isArray(saved.discrepancyFlags)
              ? saved.discrepancyFlags
              : Array.isArray(draft.discrepancyFlags)
                ? draft.discrepancyFlags
                : [],
            leadNotificationEmail: deps.env.LEAD_NOTIFICATION_EMAIL || "hello@vygo.ai",
            publicOrigin: origin,
            log: request.log,
          });

      request.log.info(
        {
          event: e2eBypass ? "readiness_scored_e2e" : "readiness_scored",
          bucket: payload.bucket,
          source,
          snapshotId: saved.id,
          briefId: side.briefId,
          snapshotQueued: side.snapshotQueued,
          opsBriefQueued: side.opsBriefQueued,
          e2e: e2eBypass,
        },
        e2eBypass ? "readiness scored (e2e)" : "readiness scored",
      );

      return reply.status(200).send({
        snapshotId: saved.id,
        id: saved.id,
        scores: payload.dimensions,
        dimensions: payload.dimensions,
        dimensionDetails: payload.dimensionDetails,
        dimensionResults: payload.dimensionResults,
        insights: sanitizePublicInsights(payload.insights),
        dimensionAnalyses: sanitizePublicDimensionAnalyses(payload.dimensionAnalyses),
        recommendation: sanitizePublicRecommendation(payload.recommendation),
        ranges: payload.ranges ?? null,
        displayMode: payload.displayMode,
        overall: payload.overall,
        bucket: payload.bucket,
        reasoning:
          typeof payload.reasoning === "string"
            ? clipPublicText(payload.reasoning, 900) || null
            : null,
        caveat:
          typeof payload.caveat === "string" ? clipPublicText(payload.caveat, 480) || null : null,
        findings: Array.isArray(payload.findings)
          ? payload.findings.map((f) => clipPublicText(f, 280)).filter(Boolean)
          : [],
        recommendedEngagement: payload.recommendedEngagement,
        offerKey: payload.offerKey,
        ctaLabel: payload.ctaLabel,
        pricing: payload.pricing,
        source: payload.source,
        snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(saved.id)}`,
        briefId: side.briefId,
        alreadySubmitted: false,
        email: {
          snapshotQueued: side.snapshotQueued,
          opsBriefQueued: side.opsBriefQueued,
        },
        ...(e2eBypass ? { e2e: true, turnstileBypassed: true } : {}),
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_score_failed" },
        error instanceof Error ? error.message : "score failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * TEST-ONLY: score a built-in profile or arbitrary report without Turnstile
   * and return a real evidence-bearing snapshot payload. Does not create a lead
   * or send email. Prefer known fixture ids for zero-DB reads; optional
   * session-token path persists when DB is available (for fresh snapshot ids).
   */
  app.post("/v1/readiness/score-e2e", async (request, reply) => {
    if (!(await enforceScorePreviewRateLimit(request, reply, deps))) return;
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const profileRaw = typeof body.profile === "string" ? body.profile.trim().toLowerCase() : "";
    const profileKey =
      profileRaw === "low"
        ? "weak"
        : profileRaw === "high"
          ? "strong"
          : profileRaw === "weak" || profileRaw === "strong" || profileRaw === "mixed"
            ? profileRaw
            : "";

    let scoringConfig = null as ReturnType<typeof scoringConfigFromDbRow> | null;
    const dbHandle = deps.getDb();
    if (dbHandle) {
      try {
        await ensureReadinessTables(dbHandle);
        const configRow = await getActiveReadinessScoringConfig(dbHandle.db, "default");
        scoringConfig = scoringConfigFromDbRow(configRow);
      } catch {
        scoringConfig = null;
      }
    }

    // Built-in fixture path — deterministic id, no DB write.
    if (profileKey && SCORE_PREVIEW_PROFILES[profileKey]) {
      const id = READINESS_E2E_SNAPSHOT_IDS[profileKey as keyof typeof READINESS_E2E_SNAPSHOT_IDS];
      try {
        const fixture = buildE2EFixtureSnapshot(
          profileKey as keyof typeof READINESS_E2E_SNAPSHOT_IDS,
          id,
          scoringConfig,
        );
        request.log.info(
          { event: "readiness_score_e2e_fixture", profile: profileKey, snapshotId: id },
          "readiness e2e fixture scored",
        );
        return reply.status(200).send({
          ...fixture,
          scores: fixture.dimensions ?? fixture.scores,
          snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(id)}`,
          email: { snapshotQueued: false, opsBriefQueued: false },
        });
      } catch (error) {
        request.log.error(
          { event: "readiness_score_e2e_failed" },
          error instanceof Error ? error.message : "score-e2e failed",
        );
        return reply
          .status(500)
          .send(
            safeError(
              "SCORING_UNAVAILABLE",
              "Scoring engine failed closed. Please try again later.",
            ),
          );
      }
    }

    // Session-token path: full pipeline without Turnstile, self-flagging contact.
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
    if (token && TOKEN_RE.test(token)) {
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : "Ratchet E2E Test";
      const emailRaw =
        typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
      const email = READINESS_E2E_EMAIL_RE.test(emailRaw)
        ? emailRaw
        : `e2e-test+score-${Date.now().toString(36)}@vygo.ai`;

      if (!dbHandle) {
        return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
      }

      try {
        const session = await findReadinessSessionByToken(dbHandle.db, token);
        if (!session) {
          return reply.status(404).send(safeError("NOT_FOUND", "Session not found."));
        }
        const draft = session.draft;
        const sourceRaw =
          typeof draft.source === "string"
            ? draft.source
            : typeof body.source === "string"
              ? body.source
              : "paste";
        const source = sourceRaw === "manual" ? "manual" : "paste";

        let report: Record<string, unknown> = {};
        if (draft.report && typeof draft.report === "object" && !Array.isArray(draft.report)) {
          report = { ...(draft.report as Record<string, unknown>) };
        } else if (
          draft.manualAnswers &&
          typeof draft.manualAnswers === "object" &&
          !Array.isArray(draft.manualAnswers)
        ) {
          report = manualAnswersToReport(draft.manualAnswers as never) as Record<string, unknown>;
        } else if (body.report && typeof body.report === "object" && !Array.isArray(body.report)) {
          report = { ...(body.report as Record<string, unknown>) };
        }
        if (!hasScorableReportAnswers(report, scoringConfig ?? undefined)) {
          const pasteFallback =
            (typeof draft.rawPasteRedacted === "string" && draft.rawPasteRedacted) ||
            (typeof draft.pasteText === "string" && draft.pasteText) ||
            (typeof body.paste === "string" && body.paste) ||
            "";
          if (pasteFallback.trim()) {
            try {
              const recovered = parseReadinessPastePartial(pasteFallback) as Record<
                string,
                unknown
              >;
              if (hasScorableReportAnswers(recovered, scoringConfig ?? undefined)) {
                report = recovered;
              }
            } catch {
              /* fail closed below */
            }
          }
        }
        report = redactReportDeep(report);

        const stage1 =
          draft.stage1 && typeof draft.stage1 === "object" && !Array.isArray(draft.stage1)
            ? (draft.stage1 as Partial<ReadinessStage1Answers>)
            : null;
        const followups =
          draft.followupAnswers &&
          typeof draft.followupAnswers === "object" &&
          !Array.isArray(draft.followupAnswers)
            ? (draft.followupAnswers as Record<string, unknown>)
            : null;

        // Fail closed on junk/empty — same policy as /v1/readiness/score.
        if (!hasScorableReportAnswers(report, scoringConfig ?? undefined)) {
          const contactFail: Record<string, unknown> = {
            source: "readiness_score_e2e",
            name,
            fullName: name,
            email,
            privacyAccepted: true,
            e2e: true,
            gatedAt: new Date().toISOString(),
          };
          const failScores: Record<string, unknown> = {
            scoringFailed: true,
            errorCode: "SCORING_FAILED",
            errorMessage:
              "Assessment answers were missing or malformed; no readiness score was computed.",
          };
          const savedFail = await persistReadinessScore(dbHandle.db, {
            token,
            scores: failScores,
            bucket: "Launch",
            contact: contactFail,
            parsedReport: report,
            rawPasteRedacted: null,
            discrepancyFlags: Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [],
          });
          request.log.info(
            { event: "readiness_score_e2e_failed_validation", snapshotId: savedFail.id },
            "readiness e2e scoring failed: empty/malformed answers",
          );
          return reply.status(200).send({
            ...publicSnapshotBody({
              id: savedFail.id,
              scores: failScores,
              bucket: null,
              contact: contactFail,
              parsedReport: report,
              createdAt: savedFail.createdAt,
            }),
            snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(savedFail.id)}`,
            scoringFailed: true,
            errorCode: "SCORING_FAILED",
            errorMessage:
              "Assessment answers were missing or malformed; no readiness score was computed.",
            e2e: true,
            turnstileRequired: false,
            persisted: true,
            email: { snapshotQueued: false, opsBriefQueued: false },
          });
        }

        const payload = computeReadinessScore({
          report,
          source,
          stage1,
          followups,
          config: scoringConfig,
        });
        const scoresJson: Record<string, unknown> = {
          ...payload,
          dimensions: payload.dimensions,
          reasoning: payload.reasoning,
          findings: payload.findings,
          bucket: payload.bucket,
        };
        const contact: Record<string, unknown> = {
          source: "readiness_score_e2e",
          name,
          fullName: name,
          email,
          privacyAccepted: true,
          e2e: true,
          gatedAt: new Date().toISOString(),
        };
        const saved = await persistReadinessScore(dbHandle.db, {
          token,
          scores: scoresJson,
          bucket: payload.bucket,
          contact,
          parsedReport: report,
          rawPasteRedacted: null,
          discrepancyFlags: Array.isArray(draft.discrepancyFlags) ? draft.discrepancyFlags : [],
        });

        request.log.info(
          {
            event: "readiness_score_e2e_persisted",
            snapshotId: saved.id,
            bucket: payload.bucket,
          },
          "readiness e2e scored and persisted",
        );

        return reply.status(200).send({
          snapshotId: saved.id,
          id: saved.id,
          scores: payload.dimensions,
          dimensions: payload.dimensions,
          dimensionDetails: payload.dimensionDetails,
          dimensionResults: payload.dimensionResults,
          insights: sanitizePublicInsights(payload.insights),
          dimensionAnalyses: sanitizePublicDimensionAnalyses(payload.dimensionAnalyses),
          recommendation: sanitizePublicRecommendation(payload.recommendation),
          ranges: payload.ranges ?? null,
          displayMode: payload.displayMode,
          overall: payload.overall,
          bucket: payload.bucket,
          reasoning:
            typeof payload.reasoning === "string"
              ? clipPublicText(payload.reasoning, 900) || null
              : null,
          caveat:
            typeof payload.caveat === "string" ? clipPublicText(payload.caveat, 480) || null : null,
          findings: Array.isArray(payload.findings)
            ? payload.findings.map((f) => clipPublicText(f, 280)).filter(Boolean)
            : [],
          recommendedEngagement: payload.recommendedEngagement,
          offerKey: payload.offerKey,
          ctaLabel: payload.ctaLabel,
          pricing: payload.pricing,
          source: payload.source,
          snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(saved.id)}`,
          e2e: true,
          turnstileRequired: false,
          persisted: true,
          email: { snapshotQueued: false, opsBriefQueued: false },
        });
      } catch (error) {
        request.log.error(
          { event: "readiness_score_e2e_failed" },
          error instanceof Error ? error.message : "score-e2e failed",
        );
        return reply
          .status(500)
          .send(
            safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."),
          );
      }
    }

    // Arbitrary report (no session): pure compute shaped as a snapshot, no DB.
    const resolved = resolveScorePreviewReport(body);
    if (!resolved) {
      return reply
        .status(400)
        .send(
          safeError(
            "VALIDATION_ERROR",
            'Provide `profile` ("weak"|"strong"|"mixed"), a session `token`, or assessment `report`/`answers`.',
          ),
        );
    }
    try {
      const report = stripPreviewContactKeys(resolved.report);
      const payload = computeReadinessScore({
        report,
        source: resolved.source,
        stage1: null,
        followups: null,
        config: scoringConfig,
      });
      // Ephemeral pseudo-id: always the mixed fixture id when custom (clients
      // should prefer profile=mixed / known ids for stable links).
      const id = READINESS_E2E_SNAPSHOT_IDS.mixed;
      const snap = publicSnapshotBody({
        id,
        scores: {
          ...payload,
          dimensions: payload.dimensions,
          reasoning: payload.reasoning,
          findings: payload.findings,
          bucket: payload.bucket,
          dimensionResults: payload.dimensionResults,
          dimensionDetails: payload.dimensionDetails,
          dimensionAnalyses: payload.dimensionAnalyses,
          insights: payload.insights,
          recommendation: payload.recommendation,
          ranges: payload.ranges,
          displayMode: payload.displayMode,
          overall: payload.overall,
          recommendedEngagement: payload.recommendedEngagement,
          offerKey: payload.offerKey,
          ctaLabel: payload.ctaLabel,
          pricing: payload.pricing,
          source: payload.source,
          caveat: payload.caveat,
        },
        bucket: payload.bucket,
        contact: {
          source: "readiness_score_e2e",
          name: "Ratchet E2E Test",
          email: "e2e-test+custom@vygo.ai",
          privacyAccepted: true,
          e2e: true,
        },
        parsedReport: report,
        createdAt: new Date().toISOString(),
      });
      return reply.status(200).send({
        ...snap,
        e2e: true,
        e2eFixture: false,
        persisted: false,
        turnstileRequired: false,
        snapshotPath: `/readiness/snapshot?id=${encodeURIComponent(id)}`,
        email: { snapshotQueued: false, opsBriefQueued: false },
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_score_e2e_failed" },
        error instanceof Error ? error.message : "score-e2e failed",
      );
      return reply
        .status(500)
        .send(
          safeError("SCORING_UNAVAILABLE", "Scoring engine failed closed. Please try again later."),
        );
    }
  });

  /** Public snapshot read-back by id — score, bucket, reasoning only (no secrets). */
  app.get("/v1/readiness/snapshot/:id", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const params = request.params as { id?: string };
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id || !UUID_RE.test(id)) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid snapshot id."));
    }

    // Seeded E2E fixtures: real scoring evidence without requiring a prior submission.
    const fixtureProfile = READINESS_E2E_SNAPSHOT_BY_ID[id];
    if (fixtureProfile) {
      try {
        let scoringConfig = null as ReturnType<typeof scoringConfigFromDbRow> | null;
        const dbHandle = deps.getDb();
        if (dbHandle) {
          try {
            await ensureReadinessTables(dbHandle);
            const configRow = await getActiveReadinessScoringConfig(dbHandle.db, "default");
            scoringConfig = scoringConfigFromDbRow(configRow);
          } catch {
            scoringConfig = null;
          }
        }
        const fixture = buildE2EFixtureSnapshot(fixtureProfile, id, scoringConfig);
        return reply.status(200).send(fixture);
      } catch (error) {
        request.log.error(
          { event: "readiness_e2e_fixture_failed" },
          error instanceof Error ? error.message : "e2e fixture failed",
        );
        return reply
          .status(500)
          .send(
            safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."),
          );
      }
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const submission = await findReadinessSubmissionById(dbHandle.db, id);
      if (!submission || !submission.scores) {
        return reply.status(404).send(safeError("NOT_FOUND", "Snapshot not found."));
      }

      // Defense in depth: re-redact any paste that might be joined elsewhere.
      if (submission.rawPasteRedacted) {
        const recheck = redactPasteSecrets(submission.rawPasteRedacted);
        if (recheck.didRedact && recheck.redacted !== submission.rawPasteRedacted) {
          // Do not repair silently into response; never return the unredacted form.
        }
      }

      const body = publicSnapshotBody(submission);
      // Absolute guarantee: no planted secret shape leaves the API.
      const serialized = JSON.stringify(body);
      const scrubbed = redactPasteSecrets(serialized);
      if (scrubbed.didRedact) {
        try {
          return reply.status(200).send(JSON.parse(scrubbed.redacted));
        } catch {
          return reply.status(200).send(body);
        }
      }
      return reply.status(200).send(body);
    } catch (error) {
      request.log.error(
        { event: "readiness_snapshot_read_failed" },
        error instanceof Error ? error.message : "snapshot read failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /** Secondary action: email a copy of the snapshot (accept/enqueue). */
  app.post("/v1/readiness/snapshot/:id/email", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const params = request.params as { id?: string };
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id || !UUID_RE.test(id)) {
      return reply.status(400).send(safeError("BAD_REQUEST", "Invalid snapshot id."));
    }

    if (!isJsonContentType(request.headers["content-type"])) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const emailRaw =
      typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);
      const submission = await findReadinessSubmissionById(dbHandle.db, id);
      if (!submission || !submission.scores) {
        return reply.status(404).send(safeError("NOT_FOUND", "Snapshot not found."));
      }

      const contactEmail =
        submission.contact && typeof submission.contact.email === "string"
          ? submission.contact.email
          : "";
      const email = emailRaw || contactEmail;
      if (!email || !isEmailLike(email)) {
        return reply.status(400).send(safeError("VALIDATION_ERROR", "A valid email is required."));
      }

      const origin =
        (deps.env as { PUBLIC_WEB_ORIGIN?: string }).PUBLIC_WEB_ORIGIN?.trim() ||
        "https://www.vygo.ai";
      const snapshotUrl = `${origin.replace(/\/$/, "")}/readiness/snapshot?id=${encodeURIComponent(id)}`;

      const scores = (submission.scores ?? {}) as Record<string, unknown>;
      const bucket = submission.bucket || (typeof scores.bucket === "string" ? scores.bucket : "");
      const name =
        submission.contact && typeof submission.contact.name === "string"
          ? submission.contact.name
          : null;

      const text = [
        `Your vygo readiness snapshot`,
        "",
        `Bucket: ${bucket || "—"}`,
        `View online: ${snapshotUrl}`,
        "",
        typeof scores.reasoning === "string" ? scores.reasoning : "",
        "",
        "This email was sent because you requested a copy on vygo.ai.",
      ]
        .filter(Boolean)
        .join("\n");

      const html = `<p>Your vygo readiness snapshot is ready.</p><p><strong>Bucket:</strong> ${String(
        bucket || "—",
      )
        .replace(/&/g, "&amp;")
        .replace(
          /</g,
          "&lt;",
        )}</p><p><a href="${snapshotUrl}">Open your snapshot</a></p><p>This email was sent because you requested a copy on vygo.ai.</p>`;

      const result = await enqueueReadinessSnapshotEmail(dbHandle.db, {
        snapshotId: id,
        email,
        snapshotUrl,
        subject: "Your vygo readiness snapshot",
        html,
        text,
        bucket: bucket || null,
        name,
      });

      request.log.info(
        { event: "readiness_snapshot_email_queued", snapshotId: id },
        "snapshot email queued",
      );

      return reply.status(202).send({
        accepted: true,
        queued: true,
        snapshotId: id,
        idempotencyKey: result.idempotencyKey,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_snapshot_email_failed" },
        error instanceof Error ? error.message : "snapshot email failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  app.post("/v1/readiness/token", async (request, reply) => {
    if (!(await enforceReadinessRateLimit(request, reply, deps))) return;

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + INGEST_TOKEN_TTL_MS);

      await dbHandle.sql`
        INSERT INTO readiness_ingest_tokens (token, expires_at)
        VALUES (${token}, ${expiresAt.toISOString()})
      `;

      return reply.status(200).send({
        token,
        expires_at: expiresAt.toISOString(),
        ttl: INGEST_TOKEN_TTL_SECONDS,
        max_uses: INGEST_TOKEN_MAX_USES,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_token_create_failed" },
        error instanceof Error ? error.message : "token create failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/readiness/start — start a per-project, status-aware run.
  // GET  /v1/readiness/start — usage docs.
  // Backs the marketing edge's POST /api/readiness/start (proxied when the edge
  // has no DATABASE_URL). Creates a NEW run row every time; only a fresh
  // in-progress run for the SAME project blocks (409). Per-user daily and
  // concurrent limits are the abuse ceiling. Fails closed on provisioning
  // failure states. No scoring changes — submission stored verbatim.
  // -------------------------------------------------------------------------
  const runStartDocs = {
    ok: true,
    endpoint: "POST /v1/readiness/start",
    description:
      "Start a new readiness analysis run for a project. Creates a new, distinct run id every time (never upserts). Historical completed/failed runs never block a new start; only a fresh in-progress run for the same project does.",
    authentication:
      "Required. Obtain a token from POST /v1/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body. Unauthenticated requests are rejected with 401.",
    body: {
      project: "project label/identifier for this run (optional; defaults to 'Default project')",
      user: "optional user/email identity; when omitted the credential identifies the user",
    },
    responses: {
      "201": "{ ok: true, status: 'in_progress', run_id, project, analysis }",
      "401": "{ error: 'unauthenticated' } — missing/invalid credential",
      "409": "{ error: 'run_in_progress', project, run_id } — same project already running",
      "429 (concurrent)": "{ error: 'too_many_concurrent_runs', limit }",
      "429 (daily)": "{ error: 'rate_limited', limit, window: '24h' }",
      "503":
        "{ error: 'provisioning_unavailable', state } — credential/provisioning failure (fails closed)",
    },
    limits: {
      maxStartsPerDay: RUN_START_MAX_PER_DAY,
      maxConcurrentRuns: RUN_START_MAX_CONCURRENT,
    },
  };

  app.get("/v1/readiness/start", async (_request, reply) => {
    return reply.status(200).send(runStartDocs);
  });

  app.post("/v1/readiness/start", async (request, reply) => {
    if (!(await enforceRunStartIpRateLimit(request, reply, deps))) return;

    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }
    const body = runPlainObject(request.body) ?? {};

    // 1. Authentication — reject a wholly unauthenticated request up front (401)
    // so it is never masked by a downstream store error.
    const credential = extractRunCredential(request.headers, body);
    if (!credential) {
      return reply
        .status(401)
        .send(
          unauthenticatedRunBody(
            "A valid session credential is required to start a run. Obtain one from POST /api/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body.",
          ),
        );
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      // Fail closed: without the store we cannot enforce the guard or limits.
      return reply.status(503).send({
        error: "unavailable",
        code: "UNAVAILABLE",
        message: "The run store is temporarily unavailable. Please try again later.",
      });
    }

    try {
      const sql = dbHandle.sql;
      await ensureReadinessTables(dbHandle);
      await ensureAnalysesTable(sql);

      // Validate credential against the ingest-token store (exists + not
      // expired). Start does not consume a use — it is not an ingest.
      if (!TOKEN_RE.test(credential)) {
        return reply
          .status(401)
          .send(
            unauthenticatedRunBody(
              "The session credential is malformed. Obtain a fresh one from POST /api/readiness/token.",
            ),
          );
      }
      const tokenRows = await sql<{ token: string; expires_at: Date | string }[]>`
        SELECT token, expires_at FROM readiness_ingest_tokens WHERE token = ${credential} LIMIT 1
      `;
      const tokenRow = tokenRows[0];
      if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
        return reply
          .status(401)
          .send(
            unauthenticatedRunBody(
              "The session credential is unknown or expired. Obtain a fresh one from POST /api/readiness/token.",
            ),
          );
      }

      // 2. Fail closed on credential/provisioning failure states — create NO run.
      const failureState = detectCredentialFailureState(body);
      if (failureState) {
        return reply.status(503).send({
          error: "provisioning_unavailable",
          code: "PROVISIONING_UNAVAILABLE",
          state: failureState,
          message:
            "Cannot start a run: the credential/provisioning pipeline is not ready. No run was created.",
        });
      }

      const principal = resolveRunPrincipal(body, credential);
      const project = resolveProjectIdentifier(pickRunField(body, RUN_PROJECT_KEYS));

      // 2b. Auto-finalize the caller's prior accepted run for this project if it
      // has matured past the processing window, so the duplicate-start guard
      // rejects (409) ONLY while a run is genuinely still processing and a new
      // start succeeds once the previous run has effectively completed — even
      // when the caller never explicitly POSTed /complete.
      await finalizeMaturedRuns(sql, { user: principal, project }, RUN_PROCESSING_WINDOW_SECONDS);

      // 3. Per-project in-progress guard — a fresh run for the SAME project blocks.
      const activeSameProject = await sql<{ id: string }[]>`
        SELECT id FROM analyses
        WHERE user_identifier = ${principal}
          AND project_identifier = ${project}
          AND status = ${RUN_IN_PROGRESS_STATUS}
          AND submission->>'started_via' = ${RUN_STARTED_VIA}
          AND created_at > now() - make_interval(mins => ${RUN_STALE_MINUTES})
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (activeSameProject[0]) {
        return reply.status(409).send({
          error: "run_in_progress",
          code: "RUN_IN_PROGRESS",
          project,
          run_id: activeSameProject[0].id,
          message: `A run is already in progress for project "${project}". Wait for it to complete (or POST /api/readiness/complete) before starting another.`,
        });
      }

      // 4. Per-user concurrency ceiling across ALL projects.
      const concurrentRows = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM analyses
        WHERE user_identifier = ${principal}
          AND status = ${RUN_IN_PROGRESS_STATUS}
          AND submission->>'started_via' = ${RUN_STARTED_VIA}
          AND created_at > now() - make_interval(mins => ${RUN_STALE_MINUTES})
      `;
      if ((concurrentRows[0]?.n ?? 0) >= RUN_START_MAX_CONCURRENT) {
        return reply
          .status(429)
          .header("Retry-After", "30")
          .send({
            error: "too_many_concurrent_runs",
            code: "TOO_MANY_CONCURRENT_RUNS",
            limit: RUN_START_MAX_CONCURRENT,
            current: concurrentRows[0]?.n ?? 0,
            message: `Too many runs in progress at once (limit ${RUN_START_MAX_CONCURRENT}). Let a run finish before starting another. No run was created.`,
          });
      }

      // 5. Per-user rolling-day start ceiling.
      const dailyRows = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM analyses
        WHERE user_identifier = ${principal}
          AND submission->>'started_via' = ${RUN_STARTED_VIA}
          AND created_at > now() - interval '24 hours'
      `;
      if ((dailyRows[0]?.n ?? 0) >= RUN_START_MAX_PER_DAY) {
        return reply
          .status(429)
          .header("Retry-After", "3600")
          .send({
            error: "rate_limited",
            code: "RATE_LIMITED",
            limit: RUN_START_MAX_PER_DAY,
            window: "24h",
            message: `Daily run-start limit reached (${RUN_START_MAX_PER_DAY} per 24h). No run was created.`,
          });
      }

      // 6. Create a NEW run row (new unique id). Never upsert — historical runs
      // for this project are preserved untouched.
      const submission = {
        ...stripRunCredentialFields(body),
        started_via: RUN_STARTED_VIA,
        run: { started_at: new Date().toISOString(), project },
      };
      const row = await insertAnalysis(sql, {
        user: principal,
        project,
        status: RUN_IN_PROGRESS_STATUS,
        submission,
      });
      return reply.status(201).send({
        ok: true,
        status: RUN_IN_PROGRESS_STATUS,
        run_id: row.id,
        project: row.project_identifier,
        analysis: toAnalysisPublic(row),
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_start_failed" },
        error instanceof Error ? error.message : "readiness start failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * POST /v1/readiness/complete — move the caller's in-progress run out of
   * in-progress (default: completed) so the next same-project start succeeds.
   * Identify the run by `run_id`, or by `project` (latest in-progress run there).
   * Result/score payload fields are stored verbatim — no scoring changes.
   */
  app.post("/v1/readiness/complete", async (request, reply) => {
    if (!(await enforceRunStartIpRateLimit(request, reply, deps))) return;

    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }
    const body = runPlainObject(request.body) ?? {};

    const credential = extractRunCredential(request.headers, body);
    if (!credential) {
      return reply
        .status(401)
        .send(
          unauthenticatedRunBody(
            "A valid session credential is required. Obtain one from POST /api/readiness/token, then send it as `Authorization: Bearer <token>` or as `submission_token` in the JSON body.",
          ),
        );
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send({
        error: "unavailable",
        code: "UNAVAILABLE",
        message: "The run store is temporarily unavailable. Please try again later.",
      });
    }

    try {
      const sql = dbHandle.sql;
      await ensureReadinessTables(dbHandle);
      await ensureAnalysesTable(sql);

      if (!TOKEN_RE.test(credential)) {
        return reply
          .status(401)
          .send(
            unauthenticatedRunBody(
              "The session credential is malformed. Obtain a fresh one from POST /api/readiness/token.",
            ),
          );
      }
      const tokenRows = await sql<{ token: string; expires_at: Date | string }[]>`
        SELECT token, expires_at FROM readiness_ingest_tokens WHERE token = ${credential} LIMIT 1
      `;
      const tokenRow = tokenRows[0];
      if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
        return reply
          .status(401)
          .send(
            unauthenticatedRunBody(
              "The session credential is unknown or expired. Obtain a fresh one from POST /api/readiness/token.",
            ),
          );
      }

      const principal = resolveRunPrincipal(body, credential);
      const runId = pickRunField(body, ["run_id", "runId", "id", "analysis_id", "analysisId"]);

      let row: AnalysisRow | null = null;
      if (runId && UUID_RE.test(runId)) {
        // The run_id (an unguessable UUIDv4 returned only in the start 201) is
        // the stable completion capability. Locate the run by id ALONE — do NOT
        // additionally scope to the session principal. Session tokens are minted
        // per call (POST /api/readiness/token), so the caller completing a run
        // legitimately presents a DIFFERENT token than the one that started it;
        // scoping by `sess:<hash(token)>` made the documented run_id un-completable
        // (404 RUN_NOT_FOUND, run wedged in_progress). Authentication is already
        // enforced above (a valid, unexpired ingest token is required).
        const rows = await sql<AnalysisRow[]>`
          SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
          FROM analyses WHERE id = ${runId} LIMIT 1
        `;
        row = rows[0] ?? null;
        if (!row) {
          return reply.status(404).send({
            error: "run_not_found",
            code: "RUN_NOT_FOUND",
            message: "No run with that id was found.",
          });
        }
        // Idempotent + non-clobbering: a run that already left in_progress is
        // returned as-is (never overwrites a finished run's stored results), so
        // a retried completion is always safe.
        if (row.status !== RUN_IN_PROGRESS_STATUS) {
          return reply.status(200).send({
            ok: true,
            status: row.status,
            run_id: row.id,
            project: row.project_identifier,
            analysis: toAnalysisPublic(row),
            idempotent: true,
          });
        }
      } else {
        const project = resolveProjectIdentifier(pickRunField(body, RUN_PROJECT_KEYS));
        const rows = await sql<AnalysisRow[]>`
          SELECT id, user_identifier, project_identifier, status, submission, created_at, updated_at
          FROM analyses
          WHERE user_identifier = ${principal}
            AND project_identifier = ${project}
            AND status = ${RUN_IN_PROGRESS_STATUS}
            AND submission->>'started_via' = ${RUN_STARTED_VIA}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        row = rows[0] ?? null;
        if (!row) {
          return reply.status(404).send({
            error: "no_run_in_progress",
            code: "NO_RUN_IN_PROGRESS",
            project,
            message: `No in-progress run found for project "${project}".`,
          });
        }
      }

      // Decide terminal status: completed by default; honor an explicit terminal
      // failure status. An in-progress status is never accepted here.
      let finalStatus = COMPLETED_ANALYSIS_STATUS;
      const rawStatus = pickRunField(body, ["status"]);
      if (rawStatus) {
        const norm = normalizeRunStatus(rawStatus);
        if (RUN_FAILED_STATUSES.has(norm)) finalStatus = "failed";
        else if (isCompletedStatus(rawStatus)) finalStatus = COMPLETED_ANALYSIS_STATUS;
      }

      const existingSubmission = runPlainObject(row.submission) ?? {};
      const mergedSubmission = {
        ...existingSubmission,
        ...stripRunCredentialFields(body),
        started_via: RUN_STARTED_VIA,
        completed_at: new Date().toISOString(),
      };

      const updated = await sql<AnalysisRow[]>`
        UPDATE analyses
        SET status = ${finalStatus},
            submission = ${JSON.stringify(mergedSubmission)}::jsonb,
            updated_at = now()
        WHERE id = ${row.id}
        RETURNING id, user_identifier, project_identifier, status, submission, created_at, updated_at
      `;
      const done = updated[0] ?? row;
      return reply.status(200).send({
        ok: true,
        status: finalStatus,
        run_id: done.id,
        project: done.project_identifier,
        analysis: toAnalysisPublic(done),
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_complete_failed" },
        error instanceof Error ? error.message : "readiness complete failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * AI ingest endpoint. Deliberately permissive CORS (any Origin may POST here —
   * AI tools run from arbitrary origins/hosts, not just the vygo.ai browser
   * page); see `PERMISSIVE_CORS_PATHS` in cors.ts, which reflects the request
   * Origin (or `*`) for this exact path instead of the strict marketing-site
   * allowlist every other readiness endpoint uses. Every rejection path (rate
   * limit, bad token, sanitization) is logged with reason + hashed ip/token id
   * — never raw IP or the token value itself.
   */
  app.post("/v1/readiness/submit", async (request, reply) => {
    if (!(await enforceSubmitIpRateLimit(request, reply, deps))) return;

    // Content-Type must be JSON if present.
    const ct = request.headers["content-type"];
    if (ct && !isJsonContentType(ct)) {
      return reply
        .status(415)
        .send(safeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const submissionToken =
      typeof body.submission_token === "string" ? body.submission_token.trim() : "";

    if (!submissionToken) {
      return reply.status(400).send(safeError("VALIDATION_ERROR", "submission_token is required."));
    }

    if (!hasUsableResultsPayload(body)) {
      return reply
        .status(400)
        .send(
          safeError(
            "VALIDATION_ERROR",
            "A non-empty results object or results_text string is required.",
          ),
        );
    }

    if (!(await enforceSubmitTokenRateLimit(request, reply, deps, submissionToken))) return;

    const tokenId = ingestTokenLogId(submissionToken);
    const rawIp = resolveClientIp(request);
    const ipHash = hashIpAddress(rawIp, deps.env)?.hash ?? null;

    if (!TOKEN_RE.test(submissionToken)) {
      request.log.info(
        { event: "readiness_submit_rejected", reason: "invalid_token", tokenId, ipHash },
        "readiness ingest rejected: malformed token",
      );
      return reply
        .status(401)
        .send(safeError("INVALID_TOKEN", "The submission token is malformed or unknown."));
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);

      // Validate token
      const tokenRows = await dbHandle.sql<
        { token: string; expires_at: Date; use_count: number }[]
      >`
        SELECT token, expires_at, use_count
        FROM readiness_ingest_tokens
        WHERE token = ${submissionToken}
        LIMIT 1
      `;
      const tokenRow = tokenRows[0];
      if (!tokenRow) {
        request.log.info(
          { event: "readiness_submit_rejected", reason: "invalid_token", tokenId, ipHash },
          "readiness ingest rejected: unknown token",
        );
        return reply
          .status(401)
          .send(safeError("INVALID_TOKEN", "The submission token is malformed or unknown."));
      }

      if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
        request.log.info(
          { event: "readiness_submit_rejected", reason: "expired_token", tokenId, ipHash },
          "readiness ingest rejected: expired token",
        );
        return reply
          .status(410)
          .send(safeError("EXPIRED_TOKEN", "The submission token has expired."));
      }

      if (tokenRow.use_count >= INGEST_TOKEN_MAX_USES) {
        request.log.info(
          { event: "readiness_submit_rejected", reason: "exhausted_token", tokenId, ipHash },
          "readiness ingest rejected: token exhausted",
        );
        return reply
          .status(403)
          .send(
            safeError("TOKEN_EXHAUSTED", "This submission token has reached its resubmit limit."),
          );
      }

      const { payload: sanitizedBody, stripped } = sanitizeIngestPayload(body);
      if (stripped) {
        request.log.warn(
          {
            event: "readiness_submit_sanitized",
            reason: "script_tag_stripped",
            tokenId,
            ipHash,
          },
          "readiness ingest: stripped disallowed markup from submitted payload",
        );
      }

      // Persist submission. Pass jsonb as a pre-stringified parameter with an
      // explicit cast: drizzle's postgres-js driver replaces this handle's
      // options.serializers[114/3802] with a transparent identity fn, so
      // sql.json() parameters reach the wire unserialized and throw.
      await dbHandle.sql`
        INSERT INTO readiness_ingest_submissions (token, payload)
        VALUES (${submissionToken}, ${JSON.stringify(sanitizedBody)}::jsonb)
      `;
      await dbHandle.sql`
        UPDATE readiness_ingest_tokens
        SET use_count = use_count + 1
        WHERE token = ${submissionToken}
      `;

      // Durable analyses store (lead follow-up): persist a NEW row keyed by the
      // real (user, project) with the FULL payload retained verbatim, so
      // /api/analyses can list/retrieve it independently of the expiring
      // token-status store. Best-effort: never fail an accepted submission on
      // an analyses-store hiccup.
      try {
        const { user, project, status } = deriveAnalysisIdentity(sanitizedBody);
        if (user) {
          await ensureAnalysesTable(dbHandle.sql);
          // Retain the full readiness form payload verbatim, but drop the
          // per-submission capability token (transport metadata, not a form
          // field) so the publicly listable analyses response never echoes it.
          const { submission_token: _omitToken, ...analysisSubmission } = sanitizedBody;
          const analysis = await insertAnalysis(dbHandle.sql, {
            user,
            // A missing project lands in 'Default project' (insertAnalysis
            // resolves it): every ingest is a new history row, never an
            // overwrite.
            project,
            status,
            submission: analysisSubmission,
          });
          request.log.info(
            {
              event: "readiness_submit_analysis_persisted",
              tokenId,
              analysisId: analysis.id,
              hasProject: project != null,
            },
            "readiness ingest persisted to analyses store",
          );
        } else {
          request.log.info(
            { event: "readiness_submit_analysis_skipped", reason: "no_user_identifier", tokenId },
            "readiness ingest not persisted to analyses store: no user identifier in payload",
          );
        }
      } catch (analysisError) {
        request.log.warn(
          {
            event: "readiness_submit_analysis_failed",
            tokenId,
            reason:
              analysisError instanceof Error
                ? analysisError.message.slice(0, 200)
                : "analysis_persist_failed",
          },
          "failed to persist readiness ingest to analyses store (non-blocking)",
        );
      }

      return reply.status(200).send({
        message: "Vygo has successfully received your readiness results.",
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_submit_failed" },
        error instanceof Error ? error.message : "submit failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });

  /**
   * Poll the status of a per-submission ingest token. The waiting readiness
   * page polls this on an interval after the prompt is generated:
   *   - 200 { status: "pending" }  — token valid, no results landed yet
   *   - 200 { status: "ready", results, results_text } — results landed (redacted)
   *   - 404 { status: "expired" }  — unknown token
   *   - 410 { status: "expired" }  — token past expiry with no landed results
   * Results that landed before expiry remain readable after it.
   */
  app.get("/v1/readiness/status", async (request, reply) => {
    if (!(await enforceStatusRateLimit(request, reply, deps))) return;

    const q = (request.query ?? {}) as Record<string, unknown>;
    const token = typeof q.token === "string" ? q.token.trim().slice(0, 128) : "";
    if (!token) {
      return reply
        .status(400)
        .send(safeError("VALIDATION_ERROR", "A submission token is required."));
    }
    // A token outside the minted format can never exist: answer exactly like
    // an unknown token so the endpoint stays a simple pending/expired signal.
    if (!TOKEN_RE.test(token)) {
      return reply.status(404).send({
        status: "expired",
        ...safeError("NOT_FOUND", "The submission token is unknown or expired."),
      });
    }

    const dbHandle = deps.getDb();
    if (!dbHandle) {
      return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
    }

    try {
      await ensureReadinessTables(dbHandle);

      const tokenRows = await dbHandle.sql<{ token: string; expires_at: Date | string }[]>`
        SELECT token, expires_at
        FROM readiness_ingest_tokens
        WHERE token = ${token}
        LIMIT 1
      `;
      const tokenRow = tokenRows[0];
      if (!tokenRow) {
        return reply.status(404).send({
          status: "expired",
          ...safeError("NOT_FOUND", "The submission token is unknown or expired."),
        });
      }

      const expiresAtIso = new Date(tokenRow.expires_at).toISOString();

      const submissionRows = await dbHandle.sql<{ payload: unknown; received_at: Date | string }[]>`
        SELECT payload, received_at
        FROM readiness_ingest_submissions
        WHERE token = ${token}
        ORDER BY received_at DESC
        LIMIT 1
      `;
      const submission = submissionRows[0];

      if (!submission) {
        // No AI-ingest submission landed for this token. Bridge to a run created
        // by POST /v1/readiness/start (durable `analyses` store): that is where a
        // started run actually completes, so this is what transitions an accepted
        // /start run to a viewable "ready" for the waiting page / acceptance poll.
        const started = await resolveStartedRunStatus(dbHandle.sql, token);
        if (started?.state === "ready") {
          const receivedAt =
            started.run.updated_at instanceof Date
              ? started.run.updated_at.toISOString()
              : String(started.run.updated_at);
          return reply.status(200).send({
            token,
            status: "ready",
            expires_at: expiresAtIso,
            received_at: receivedAt,
            results: started.results,
            results_text: started.resultsText,
            run_id: started.run.id,
            project: started.run.project_identifier,
            run_status: started.run.status,
          });
        }
        if (started?.state === "pending") {
          return reply.status(200).send({
            token,
            status: "pending",
            expires_at: expiresAtIso,
            run_id: started.run.id,
            project: started.run.project_identifier,
          });
        }

        if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
          return reply.status(410).send({
            status: "expired",
            ...safeError("EXPIRED_TOKEN", "The submission token is unknown or expired."),
          });
        }
        return reply.status(200).send({
          token,
          status: "pending",
          expires_at: expiresAtIso,
        });
      }

      const payload =
        submission.payload &&
        typeof submission.payload === "object" &&
        !Array.isArray(submission.payload)
          ? (submission.payload as Record<string, unknown>)
          : {};
      // Re-redact on read-back so a planted secret in the raw ingest payload
      // never echoes back to the page.
      const resultsText =
        typeof payload.results_text === "string"
          ? redactPasteSecrets(payload.results_text).redacted
          : null;
      const results =
        payload.results && typeof payload.results === "object" && !Array.isArray(payload.results)
          ? (payload.results as Record<string, unknown>)
          : null;
      const receivedAt =
        submission.received_at instanceof Date
          ? submission.received_at.toISOString()
          : String(submission.received_at);

      return reply.status(200).send({
        token,
        status: "ready",
        expires_at: expiresAtIso,
        received_at: receivedAt,
        results,
        results_text: resultsText,
      });
    } catch (error) {
      request.log.error(
        { event: "readiness_status_failed" },
        error instanceof Error ? error.message : "status failed",
      );
      return reply
        .status(500)
        .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
    }
  });
}
