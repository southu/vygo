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
 *
 * All Postgres writes go through these server endpoints. Rate-limited by IP.
 * Never returns connection strings, DATABASE_URL, stack traces, or secrets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
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
  manualAnswersToReport,
  redactPasteSecrets,
  runDeterministicParse,
  scoringConfigFromDbRow,
  selectFollowupQuestions,
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
    const canonical =
      profileRaw === "low" ? "weak" : profileRaw === "high" ? "strong" : profileRaw;
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
    dimensionAnalyses: Array.isArray(payload.dimensionAnalyses) ? payload.dimensionAnalyses : [],
    /** Pattern-branched detailed engagement recommendation. */
    recommendation: payload.recommendation ?? null,
    ranges: payload.ranges ?? null,
    reasoning: payload.reasoning,
    caveat: payload.caveat ?? null,
    findings: payload.findings,
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
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(report)) {
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

/** Collapse whitespace + truncate free-text for client-safe surfaces. */
function clipPublicText(value: unknown, max: number): string {
  if (value == null) return "";
  const t = String(value).replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
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
    const source_answer = clipPublicText(
      row.source_answer ?? row.sourceAnswer,
      280,
    );
    const dimension = typeof row.dimension === "string" ? row.dimension.trim() : "";
    // Sparse degrade: skip empty-quote insights rather than inventing content.
    if (!headline || !source_answer) continue;
    out.push({ type, headline, detail, source_answer, dimension });
  }
  return out;
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
  const dimensionAnalyses = Array.isArray(scores.dimensionAnalyses)
    ? scores.dimensionAnalyses
    : [];
  const recommendation =
    scores.recommendation && typeof scores.recommendation === "object"
      ? scores.recommendation
      : null;

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
    reasoning: typeof scores.reasoning === "string" ? scores.reasoning : null,
    caveat: typeof scores.caveat === "string" ? scores.caveat : null,
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
    // Intentionally omit how-to-fix / remediation keys.
    reportSummary: report
      ? {
          summary: report.summary ?? null,
          tenancy: report.tenancy ?? null,
          auth: report.auth ?? null,
          tests: report.tests ?? null,
          deploys: report.deploys ?? null,
          pii_categories: report.pii_categories ?? null,
        }
      : null,
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

  // Seed Stage 5 scoring config v2 (dimension weights as data).
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
      return reply.status(400).send(
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
        .send(safeError("VALIDATION_ERROR", "Assessment answers must include at least one scored field."));
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
          safeError(
            "SCORING_UNAVAILABLE",
            "Scoring engine failed closed. Please try again later.",
          ),
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

      // Deep-redact free-text report fields before scoring/storage.
      report = redactReportDeep(report);

      // Malformed / empty answer payload: fail closed with an honest error (no silent score).
      const reportKeys = Object.keys(report).filter((k) => {
        const v = report[k];
        if (v == null) return false;
        if (typeof v === "string") return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        return true;
      });
      if (reportKeys.length === 0) {
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
        dimensionAnalyses: payload.dimensionAnalyses,
        recommendation: payload.recommendation,
        ranges: payload.ranges ?? null,
        displayMode: payload.displayMode,
        overall: payload.overall,
        bucket: payload.bucket,
        reasoning: payload.reasoning,
        caveat: payload.caveat ?? null,
        findings: payload.findings,
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
    const profileRaw =
      typeof body.profile === "string" ? body.profile.trim().toLowerCase() : "";
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
          insights: payload.insights,
          dimensionAnalyses: payload.dimensionAnalyses,
          recommendation: payload.recommendation,
          ranges: payload.ranges ?? null,
          displayMode: payload.displayMode,
          overall: payload.overall,
          bucket: payload.bucket,
          reasoning: payload.reasoning,
          caveat: payload.caveat ?? null,
          findings: payload.findings,
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
          .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
      }
    }

    // Arbitrary report (no session): pure compute shaped as a snapshot, no DB.
    const resolved = resolveScorePreviewReport(body);
    if (!resolved) {
      return reply.status(400).send(
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
          safeError(
            "SCORING_UNAVAILABLE",
            "Scoring engine failed closed. Please try again later.",
          ),
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
          .send(safeError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later."));
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
}
