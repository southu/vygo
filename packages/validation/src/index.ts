import { z } from "zod";

/** Shared Zod schemas for web and API (waitlist, availability, readiness report). */

export {
  READINESS_REPORT_CONTRACT_VERSION,
  READINESS_REPORT_V1_END,
  READINESS_REPORT_V1_FIELDS,
  READINESS_REPORT_V1_START,
  extractReadinessReportV1Block,
  formatReadinessReportV1,
  parseConfidenceValue,
  parseReadinessReportV1,
  readinessReportV1PartialSchema,
  readinessReportV1Schema,
  type ReadinessReportV1,
  type ReadinessReportV1Field,
  type ReadinessReportV1Partial,
} from "./report-schema.js";

export {
  PRODUCT_DESCRIPTION_MAX,
  WHO_USES_OPTIONS,
  BUILT_WITH_OPTIONS,
  BLOCKER_OPTIONS,
  MAX_BLOCKERS,
  DEADLINE_OPTIONS,
  VARIANT_A_TOOLS,
  VARIANT_B_TOOLS,
  EMPTY_STAGE1,
  isBuiltWithOption,
  isWhoUsesOption,
  isBlockerOption,
  isDeadlineOption,
  resolvePromptVariant,
  isNotBuiltYet,
  isFeaturesOnlySoftOffRamp,
  deadlineNeedsDetail,
  type WhoUsesOption,
  type BuiltWithOption,
  type BlockerOption,
  type DeadlineOption,
  type PromptVariant,
  type ReadinessStage1Answers,
  type ReadinessDraft,
} from "./readiness-intake.js";

export {
  READINESS_PROMPT_REASSURANCE,
  READINESS_SUBMIT_URL,
  buildPromptHowTo,
  buildDiagnosticPrompt,
  isRepoAccessTool,
  isBuilderChatTool,
  type BuildDiagnosticPromptInput,
} from "./prompt.js";

export {
  scanPasteForSecrets,
  PASTE_SECRETS_BLOCK_MESSAGE,
  type PasteSecretHit,
  type PasteSecretScanResult,
} from "./paste-secrets.js";

export {
  REDACTED_PLACEHOLDER,
  redactPasteSecrets,
  assertNoSecretLeak,
  type PasteRedactionResult,
} from "./paste-redact.js";

export {
  stripMarkdownFences,
  unwrapChatLineWrapping,
  ensureReportFooter,
  normalizeReadinessPaste,
  parseNormalizedReadinessPaste,
  parseReadinessPastePartial,
  buildConfirmationFindings,
  describeStack,
  describeSize,
} from "./paste-normalize.js";

export {
  stackSourceFromReport,
  parseStackEntries,
  parseSizeMetrics,
  classifyReadinessSize,
  classifyFindingSeverity,
  parseStructuredFindings,
  parseStructuredReadiness,
  structuredReadinessFromReport,
  isMalformedStructuredPaste,
  type StackCategory,
  type StackEntry,
  type SizeClassification,
  type SizeMetric,
  type StructuredSize,
  type FindingSeverity,
  type StructuredFinding,
  type StructuredReadiness,
} from "./paste-structured.js";

export {
  fillUnknownFields,
  recoverSloppyPaste,
  runDeterministicParse,
  tryLlmNormalizeReport,
  type ParseRoute,
  type ParsePipelineResult,
} from "./parse-pipeline.js";

export {
  BUDGET_BUCKET_OPTIONS,
  FOLLOWUP_QUESTION_SEED,
  evaluateFollowupTriggers,
  selectFollowupQuestions,
  detectFollowupDiscrepancies,
  followupSeedMetadata,
  type BudgetBucket,
  type FollowupQuestionType,
  type FollowupTrigger,
  type FollowupQuestionDef,
  type PublicFollowupQuestion,
  type DiscrepancyFlag,
} from "./followups.js";

export {
  GOLDEN_CLEAN_FIELDS,
  FIXTURE_CLEAN,
  FIXTURE_CHAT_WRAPPED,
  FIXTURE_FENCED,
  FIXTURE_MISSING_FOOTER,
  FIXTURE_SLOPPY,
  buildPlantedSecretPaste,
  GOLDEN_FIXTURE_NAMES,
  getGoldenFixture,
  type GoldenFixtureName,
} from "./fixtures/golden-pastes.js";

export {
  MANUAL_SOURCE,
  MANUAL_CONFIDENCE_LABEL,
  MANUAL_CONFIDENCE_VALUE,
  MANUAL_QUESTIONNAIRE,
  emptyManualAnswers,
  isManualQuestionnaireComplete,
  manualAnswersToReport,
  buildManualSessionDraft,
  type ManualQuestion,
  type ManualQuestionType,
  type ManualAnswers,
} from "./manual-questionnaire.js";

export {
  buildLeadBrief,
  buildTalkingPoints,
  tryLlmPolishBrief,
  toPublicLeadBrief,
  type LeadBrief,
  type LeadBriefInput,
  type LeadBriefContact,
  type LeadBriefScoreSummary,
} from "./lead-brief.js";

export {
  READINESS_DIMENSIONS,
  READINESS_CHECK_LABELS,
  DEFAULT_SCORING_CONFIG,
  computeReadinessScore,
  scoreAllDimensions,
  scoreAllDimensionDetails,
  scoreFieldValue,
  unknownRiskScore,
  scoreDimension,
  scoreDimensionDetail,
  overallFromDimensions,
  rangesFromDimensions,
  toDimensionResults,
  buildSubMetricReason,
  deriveBucketSignals,
  assignEngagementBucket,
  buildTopFindings,
  buildEngagementReasoning,
  REASONING_FREE_TEXT_MAX_CHARS,
  REASONING_BODY_MAX_CHARS,
  engagementMeta,
  hasScorableReportAnswers,
  scoringConfigFromDbRow,
  normalizeScoringConfig,
  defaultScoringRulesJson,
  defaultScoringWeightsJson,
  containsRemediationDetail,
  type ReadinessDimension,
  type DimensionScores,
  type DimensionRanges,
  type DimensionDetail,
  type DimensionDetails,
  type DimensionScoreResult,
  type SubMetricScore,
  type SubMetricStatus,
  type SubMetricEvidence,
  type SubMetricResult,
  type EngagementBucket,
  type ScoringSource,
  type ReadinessScorePayload,
  type ReadinessScoringConfig,
  type FieldScoreRule,
  type DimensionConfig,
  type BucketSignals,
  type BucketResult,
  type ComputeScoreInput,
} from "./readiness-scoring.js";

export {
  buildEvidenceInsights,
  clipByCodePoints,
  clipDisplayText,
  extractNamedTools,
  extractIntegrationCount,
  extractTeamSignals,
  rawAnswerText,
  INSIGHT_SOURCE_MAX_CHARS,
  INSIGHT_DETAIL_MAX_CHARS,
  INSIGHT_HEADLINE_MAX_CHARS,
  type EvidenceInsight,
  type InsightType,
} from "./evidence-insights.js";

export {
  buildDetailedAnalysis,
  buildDimensionAnalysis,
  buildAllDimensionAnalyses,
  buildDetailedRecommendation,
  selectRecommendationPattern,
  deriveAdoptionSignals,
  type DimensionAnalysis,
  type DetailedRecommendation,
  type DetailedAnalysisPayload,
  type AdoptionSignals,
} from "./detailed-analysis.js";

// NOTE: the learnings-log module touches node:fs/node:path and MUST NOT be
// re-exported from this browser-bundled barrel (it breaks the Next.js web
// build). Import it via the "@vygo/validation/learnings-log" subpath instead.

/**
 * Public, browser-safe projection of the Ratchet learnings log for the
 * guide-progress panel and its JSON API. This mapping is PURE (no node:fs) so
 * the Fastify API route and the static web build share exactly one contract,
 * guaranteeing the counts and rows rendered on the page match the endpoint.
 *
 * `status` collapses the internal lifecycle (pending-in-guide / draft /
 * incorporated) into the two states the public panel shows: anything not yet
 * incorporated into the guide is reported as "pending".
 */
export type PublicLearningStatus = "pending" | "incorporated";

/** One learning as surfaced by GET /api/guide/learnings and the panel. */
export interface PublicLearning {
  id: string;
  summary: string;
  /**
   * Short human-readable name for the learning (used to name it in changelog /
   * revision entries). Present only when the source entry carries a title.
   */
  title?: string;
  /** Source link (commit / PR / release-note URL). */
  source: string;
  status: PublicLearningStatus;
  /** Affected guide section(s). */
  sections: string[];
  /** Calendar date the learning was captured (YYYY-MM-DD). */
  date: string;
  /**
   * Calendar date (YYYY-MM-DD) the learning was incorporated into the guide.
   * Present only for incorporated learnings; this is the dashboard's per-entry
   * incorporation timestamp.
   */
  incorporated_date?: string;
}

/** Full shape returned by GET /api/guide/learnings. */
export interface GuideLearningsResponse {
  guide_last_updated: string;
  counts: { pending: number; incorporated: number };
  learnings: PublicLearning[];
}

/**
 * Minimal structural shape read from the on-disk learnings log. Declared
 * locally (rather than importing the fs-touching learnings-log module) so this
 * mapper stays browser-safe.
 */
export interface GuideLearningSourceEntry {
  id: string;
  summary: string;
  title?: string;
  source_link: string;
  affected_sections: string[];
  status: string;
  date: string;
  incorporated_date?: string;
}

/** Collapse an internal lifecycle status to the public pending/incorporated pair. */
export function toPublicLearningStatus(status: string): PublicLearningStatus {
  return status === "incorporated" ? "incorporated" : "pending";
}

/** Latest YYYY-MM-DD string in `dates`, or "" when the list is empty. */
function latestDate(dates: string[]): string {
  return dates.reduce((max, d) => (d > max ? d : max), "");
}

/**
 * Project raw log entries into the public guide-learnings response. Counts are
 * derived from the same mapped list that is returned, so counts.pending /
 * counts.incorporated always equal the number of learnings in each state.
 */
export function toGuideLearningsResponse(
  entries: GuideLearningSourceEntry[],
): GuideLearningsResponse {
  const learnings: PublicLearning[] = entries.map((entry) => ({
    id: entry.id,
    summary: entry.summary,
    ...(entry.title ? { title: entry.title } : {}),
    source: entry.source_link,
    status: toPublicLearningStatus(entry.status),
    sections: [...entry.affected_sections],
    date: entry.date,
    ...(entry.incorporated_date ? { incorporated_date: entry.incorporated_date } : {}),
  }));

  const pending = learnings.filter((l) => l.status === "pending").length;
  const incorporated = learnings.filter((l) => l.status === "incorporated").length;

  // The guide's last-updated date is the most recent incorporation date; when
  // nothing is incorporated yet, fall back to the most recent learning date.
  const incorporatedDates = entries
    .filter((e) => e.status === "incorporated" && e.incorporated_date)
    .map((e) => e.incorporated_date as string);
  const guide_last_updated =
    incorporatedDates.length > 0
      ? latestDate(incorporatedDates)
      : latestDate(entries.map((e) => e.date));

  return {
    guide_last_updated,
    counts: { pending, incorporated },
    learnings,
  };
}

export {
  STALENESS_REASONS,
  computeStaleness,
  resolveLastRefresh,
  windowToken,
  type StalenessReason,
  type StalenessInput,
  type StalenessStatus,
  type RefreshSourceEntry,
} from "./staleness.js";

export const availabilityStatusSchema = z.enum(["open", "waitlist", "paused"]);

export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

export const engagementTypeSchema = z.enum(["audit", "launch", "scale", "enterprise", "general"]);

export type EngagementType = z.infer<typeof engagementTypeSchema>;

/**
 * Public availability JSON contract (documented API fields only).
 * Never includes database IDs, updater attribution, or internal errors.
 */
export const publicAvailabilitySchema = z.object({
  status: availabilityStatusSchema,
  nextOpeningDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  engagementType: engagementTypeSchema,
  displayNote: z.string().nullable(),
  availableStarts: z.number().int().nonnegative().nullable(),
  updatedAt: z.string().datetime(),
});

export type PublicAvailability = z.infer<typeof publicAvailabilitySchema>;

export const publicAvailabilityResponseSchema = z.object({
  data: publicAvailabilitySchema,
});

export type PublicAvailabilityResponse = z.infer<typeof publicAvailabilityResponseSchema>;

/** @deprecated Prefer publicAvailabilitySchema; kept for transitional web copy helpers. */
export const legacyPublicAvailabilitySchema = z.object({
  status: availabilityStatusSchema,
  nextOpeningLabel: z.string().nullable(),
  nextOpeningAt: z.string().datetime().nullable(),
  message: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Waitlist intake
// ---------------------------------------------------------------------------

/** Documented max length for each UTM attribute value. Over-limit values are rejected. */
export const UTM_MAX_LENGTH = 128;

/** Documented field length bounds. */
export const WAITLIST_LIMITS = {
  fullName: 120,
  email: 254,
  companyName: 160,
  role: 120,
  productUrl: 500,
  prototypePlatform: 120,
  budgetRange: 64,
  message: 4000,
  landingPage: 500,
  referrer: 500,
  honeypot: 200,
  utm: UTM_MAX_LENGTH,
  turnstileToken: 2048,
} as const;

export const leadStageSchema = z.enum([
  "prototype",
  "private_beta",
  "live_users",
  "revenue",
  "enterprise_pipeline",
]);

export type LeadStage = z.infer<typeof leadStageSchema>;

export const leadBlockerSchema = z.enum([
  "reliability_scale",
  "security",
  "security_compliance",
  "identity_access",
  "maintainability",
  "infrastructure",
  "data_migration",
  "other",
]);

export type LeadBlocker = z.infer<typeof leadBlockerSchema>;

export const desiredStartWindowSchema = z.enum([
  "asap",
  "within_30_days",
  "within_60_days",
  "this_quarter",
  "later",
]);

export type DesiredStartWindow = z.infer<typeof desiredStartWindowSchema>;

export const budgetRangeSchema = z.enum([
  "under_25k",
  "25k_75k",
  "75k_150k",
  "150k_300k",
  "300k_plus",
  "not_determined",
]);

export type BudgetRange = z.infer<typeof budgetRangeSchema>;

/**
 * Detect Unicode C0/C1 control characters (and DEL) that must not be stored.
 *
 * - Single-line free text: reject all C0 (U+0000–U+001F), DEL (U+007F), and C1 (U+0080–U+009F).
 * - Multiline (`message`): allow tab (U+0009), LF (U+000A), and CR (U+000D) only among C0.
 *
 * NUL and other controls otherwise pass length/type checks but break Postgres text
 * or pollute stored leads — reject at the shared Zod layer for every consumer.
 */
export function hasDisallowedControlChars(
  value: string,
  options?: { allowMultilineWhitespace?: boolean },
): boolean {
  if (options?.allowMultilineWhitespace) {
    // Allow \t \n \r; reject remaining C0, DEL, and C1.
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(value);
  }
  return /[\u0000-\u001F\u007F-\u009F]/.test(value);
}

/**
 * Strip U+0000 (NUL) from free-text. Postgres text/jsonb cannot store null
 * bytes; other C0 controls are allowed so real-world pastes with bells/ANSI
 * still work. Prefer stripping over 500 INTERNAL_ERROR on ingest.
 */
export function stripNullBytes(value: string): string {
  if (!value.includes("\u0000")) return value;
  return value.replace(/\u0000/g, "");
}

/**
 * Deep-walk JSON-like values and strip U+0000 from every string leaf so
 * readiness drafts, reports, and score payloads remain Postgres-safe.
 */
export function stripNullBytesDeep<T>(value: T): T {
  if (typeof value === "string") {
    return stripNullBytes(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripNullBytesDeep(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = stripNullBytesDeep(child);
    }
    return out as T;
  }
  return value;
}

/** Trimmed free-text string with max length and control-character rejection. */
const freeTextString = (max: number, options?: { allowMultilineWhitespace?: boolean }) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !hasDisallowedControlChars(value, options), {
      message: "Please review this field.",
    });

/**
 * HTTPS-only product URL. Rejects non-http(s), javascript:, data:, and empty hosts.
 * Accepts documented HTTPS URLs; also allows http for localhost only.
 */
export function normalizeAndValidateHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (hasDisallowedControlChars(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") return null;
  if (protocol === "http:") {
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
      return null;
    }
  }
  if (!parsed.hostname) return null;
  // Strip credentials if present
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

export const httpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(WAITLIST_LIMITS.productUrl)
  .transform((value, ctx) => {
    const normalized = normalizeAndValidateHttpsUrl(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid HTTPS product URL.",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(WAITLIST_LIMITS.email)
  .refine((value) => !hasDisallowedControlChars(value), {
    message: "Enter a valid work email.",
  })
  .email({ message: "Enter a valid work email." })
  .transform((value) => value.toLowerCase());

export const utmValueSchema = z
  .string()
  .trim()
  .max(UTM_MAX_LENGTH)
  .refine((value) => !hasDisallowedControlChars(value), {
    message: "Please review this field.",
  })
  .nullable()
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

export const utmObjectSchema = z
  .object({
    source: utmValueSchema,
    medium: utmValueSchema,
    campaign: utmValueSchema,
    content: utmValueSchema,
    term: utmValueSchema,
  })
  .strict()
  .optional()
  .default(() => ({
    source: null,
    medium: null,
    campaign: null,
    content: null,
    term: null,
  }));

/**
 * Allowed body keys for waitlist intake. Unknown keys are rejected (strict).
 * `website` is the honeypot field and must be empty when present.
 * `formStartedAt` is client-reported form open time (ms epoch or ISO) for min-completion checks.
 */
export const waitlistRequestSchema = z
  .object({
    fullName: freeTextString(WAITLIST_LIMITS.fullName).min(1, "Enter your full name."),
    email: emailSchema,
    companyName: freeTextString(WAITLIST_LIMITS.companyName).min(1, "Enter your company name."),
    role: freeTextString(WAITLIST_LIMITS.role).optional().nullable(),
    productUrl: httpsUrlSchema,
    prototypePlatform: freeTextString(WAITLIST_LIMITS.prototypePlatform).optional().nullable(),
    stage: leadStageSchema,
    primaryBlocker: leadBlockerSchema,
    desiredStartWindow: desiredStartWindowSchema,
    budgetRange: budgetRangeSchema.optional().nullable(),
    commercialDeadline: z.boolean().optional().default(false),
    // Multiline free text: allow tab/newline/CR only among control characters.
    message: freeTextString(WAITLIST_LIMITS.message, { allowMultilineWhitespace: true }).min(
      1,
      "Add a short description.",
    ),
    privacyAccepted: z.boolean().refine((v) => v === true, {
      message: "Privacy acceptance is required.",
    }),
    marketingConsent: z.boolean().optional().default(false),
    turnstileToken: z
      .string()
      .min(1)
      .max(WAITLIST_LIMITS.turnstileToken)
      .refine((value) => !hasDisallowedControlChars(value), {
        message: "Please review this field.",
      }),
    idempotencyKey: z.string().uuid().optional(),
    utm: utmObjectSchema,
    landingPage: freeTextString(WAITLIST_LIMITS.landingPage).optional().nullable(),
    referrer: freeTextString(WAITLIST_LIMITS.referrer).optional().nullable(),
    /** Honeypot — must be empty / absent. Non-empty is an abuse signal (handled by route). */
    website: z
      .string()
      .max(WAITLIST_LIMITS.honeypot)
      .refine((value) => !hasDisallowedControlChars(value), {
        message: "Please review this field.",
      })
      .optional(),
    /** Client form open time for minimum completion signal. */
    formStartedAt: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  })
  .strict();

export type WaitlistRequestInput = z.input<typeof waitlistRequestSchema>;
export type WaitlistRequest = z.infer<typeof waitlistRequestSchema>;

/** Normalized waitlist application used after Zod parse (privacy always true). */
export type WaitlistApplication = WaitlistRequest;

/** @deprecated Transitional simple schema; prefer waitlistRequestSchema. */
export const waitlistApplicationSchema = waitlistRequestSchema;

export const waitlistSuccessSchema = z.object({
  data: z.object({
    accepted: z.literal(true),
    message: z.string(),
    /** Durable application identifier (waitlist entry id). */
    applicationId: z.string().uuid().optional(),
    /** Marketing consent as stored — separate from transactional email state. */
    marketingConsent: z.boolean().optional(),
    /** Transactional email queue summary (never includes bodies or secrets). */
    email: z
      .object({
        queued: z.boolean(),
        jobCount: z.number().int().nonnegative(),
        kinds: z.array(z.string()).optional(),
      })
      .optional(),
  }),
});

export type WaitlistSuccessBody = z.infer<typeof waitlistSuccessSchema>;

/** Generic success without identifiers (abuse silent accept / legacy). */
export const WAITLIST_SUCCESS_BODY: WaitlistSuccessBody = {
  data: {
    accepted: true,
    message: "Your application has been received.",
  },
};

export function buildWaitlistSuccessBody(input: {
  applicationId: string;
  marketingConsent: boolean;
  emailJobCount: number;
  emailKinds?: string[];
}): WaitlistSuccessBody {
  return {
    data: {
      accepted: true,
      message: "Your application has been received.",
      applicationId: input.applicationId,
      marketingConsent: input.marketingConsent,
      email: {
        queued: input.emailJobCount > 0,
        jobCount: input.emailJobCount,
        kinds: input.emailKinds,
      },
    },
  };
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** Map Zod issues to PII-safe field messages (never echo submitted values). */
export function zodIssuesToFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_root";
    if (fields[key]) continue;
    // Generic messages — avoid reflecting raw input.
    if (key === "email") {
      fields[key] = "Enter a valid work email.";
    } else if (key === "productUrl") {
      fields[key] = "Enter a valid HTTPS product URL.";
    } else if (key === "privacyAccepted") {
      fields[key] = "Privacy acceptance is required.";
    } else if (key.startsWith("utm.")) {
      fields[key] = "UTM value is invalid or too long.";
    } else if (issue.code === "unrecognized_keys") {
      fields[key] = "Unexpected field.";
    } else if (issue.code === "too_big") {
      fields[key] = "Value exceeds the maximum allowed length.";
    } else {
      fields[key] = "Please review this field.";
    }
  }
  return fields;
}
