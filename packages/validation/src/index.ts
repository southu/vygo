import { z } from "zod";

/** Shared Zod schemas for web and API (waitlist, availability). */

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

const trimmedString = (max: number) => z.string().trim().max(max);

/**
 * HTTPS-only product URL. Rejects non-http(s), javascript:, data:, and empty hosts.
 * Accepts documented HTTPS URLs; also allows http for localhost only.
 */
export function normalizeAndValidateHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
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
  .email({ message: "Enter a valid work email." })
  .transform((value) => value.toLowerCase());

export const utmValueSchema = z
  .string()
  .trim()
  .max(UTM_MAX_LENGTH)
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
    fullName: trimmedString(WAITLIST_LIMITS.fullName).min(1, "Enter your full name."),
    email: emailSchema,
    companyName: trimmedString(WAITLIST_LIMITS.companyName).min(1, "Enter your company name."),
    role: trimmedString(WAITLIST_LIMITS.role).optional().nullable(),
    productUrl: httpsUrlSchema,
    prototypePlatform: trimmedString(WAITLIST_LIMITS.prototypePlatform).optional().nullable(),
    stage: leadStageSchema,
    primaryBlocker: leadBlockerSchema,
    desiredStartWindow: desiredStartWindowSchema,
    budgetRange: budgetRangeSchema.optional().nullable(),
    commercialDeadline: z.boolean().optional().default(false),
    message: trimmedString(WAITLIST_LIMITS.message).min(1, "Add a short description."),
    privacyAccepted: z.boolean().refine((v) => v === true, {
      message: "Privacy acceptance is required.",
    }),
    marketingConsent: z.boolean().optional().default(false),
    turnstileToken: z.string().min(1).max(WAITLIST_LIMITS.turnstileToken),
    idempotencyKey: z.string().uuid().optional(),
    utm: utmObjectSchema,
    landingPage: trimmedString(WAITLIST_LIMITS.landingPage).optional().nullable(),
    referrer: trimmedString(WAITLIST_LIMITS.referrer).optional().nullable(),
    /** Honeypot — must be empty / absent. Non-empty is an abuse signal (handled by route). */
    website: z.string().max(WAITLIST_LIMITS.honeypot).optional(),
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
  }),
});

export type WaitlistSuccessBody = z.infer<typeof waitlistSuccessSchema>;

export const WAITLIST_SUCCESS_BODY: WaitlistSuccessBody = {
  data: {
    accepted: true,
    message: "Your application has been received.",
  },
};

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
