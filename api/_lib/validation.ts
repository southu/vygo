/**
 * Waitlist intake validation for the marketing edge (www.vygo.ai) serverless
 * function. Rules are derived from the shared `@vygo/validation` contract and
 * the `waitlist_entries` data model, re-implemented here with no dependencies so
 * the Vercel function bundles cleanly (only the Postgres driver is imported at
 * runtime).
 *
 * Field error messages are PII-safe: they never echo the submitted value.
 */

/** Documented field length bounds (mirrors @vygo/validation WAITLIST_LIMITS). */
export const LIMITS = {
  fullName: 120,
  email: 254,
  companyName: 160,
  role: 120,
  productUrl: 500,
  prototypePlatform: 120,
  message: 4000,
  landingPage: 500,
  referrer: 500,
  honeypot: 200,
  utm: 128,
} as const;

export const LEAD_STAGES = [
  "prototype",
  "private_beta",
  "live_users",
  "revenue",
  "enterprise_pipeline",
] as const;

export const LEAD_BLOCKERS = [
  "reliability_scale",
  "security",
  "security_compliance",
  "identity_access",
  "maintainability",
  "infrastructure",
  "data_migration",
  "other",
] as const;

export const DESIRED_START_WINDOWS = [
  "asap",
  "within_30_days",
  "within_60_days",
  "this_quarter",
  "later",
] as const;

export const BUDGET_RANGES = [
  "under_25k",
  "25k_75k",
  "75k_150k",
  "150k_300k",
  "300k_plus",
  "not_determined",
] as const;

export type Utm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

/** Normalized, validated waitlist application. */
export type WaitlistValue = {
  email: string;
  fullName: string;
  companyName: string;
  role: string | null;
  productUrl: string;
  prototypePlatform: string | null;
  stage: string;
  primaryBlocker: string;
  desiredStart: string;
  budgetRange: string | null;
  commercialDeadline: boolean;
  message: string;
  marketingConsent: boolean;
  landingPage: string | null;
  referrer: string | null;
  utm: Utm;
};

export type ParseResult =
  { ok: true; value: WaitlistValue } | { ok: false; fields: Record<string, string> };

const GENERIC = "Please review this field.";
const TOO_LONG = "Value exceeds the maximum allowed length.";

// Single-line free text: reject all C0 (U+0000–U+001F), DEL (U+007F), C1 (U+0080–U+009F).
const CONTROL_SINGLE_LINE = /[\u0000-\u001F\u007F-\u009F]/;
// Multiline (`message`): allow tab (U+0009), LF (U+000A), CR (U+000D); reject the rest.
const CONTROL_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/**
 * Reject Unicode C0/C1 control characters (and DEL). Single-line fields reject
 * all of them; multiline `message` additionally allows tab/newline/CR.
 */
function hasControlChars(value: string, allowMultilineWhitespace = false): boolean {
  return (allowMultilineWhitespace ? CONTROL_MULTILINE : CONTROL_SINGLE_LINE).test(value);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * HTTPS-only product URL. Rejects non-http(s), javascript:, data:, empty hosts,
 * and strips embedded credentials. http is allowed only for localhost.
 */
export function normalizeHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || hasControlChars(trimmed)) return null;
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
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return null;
  }
  if (!parsed.hostname) return null;
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

function optionalText(
  value: unknown,
  max: number,
  fields: Record<string, string>,
  key: string,
): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    fields[key] = GENERIC;
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > max) {
    fields[key] = TOO_LONG;
    return null;
  }
  if (hasControlChars(trimmed)) {
    fields[key] = GENERIC;
    return null;
  }
  return trimmed;
}

function requiredText(
  value: unknown,
  max: number,
  fields: Record<string, string>,
  key: string,
  options: { allowMultilineWhitespace?: boolean } = {},
): string | null {
  if (typeof value !== "string") {
    fields[key] = GENERIC;
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    fields[key] = GENERIC;
    return null;
  }
  if (trimmed.length > max) {
    fields[key] = TOO_LONG;
    return null;
  }
  if (hasControlChars(trimmed, options.allowMultilineWhitespace)) {
    fields[key] = GENERIC;
    return null;
  }
  return trimmed;
}

function enumValue(
  value: unknown,
  allowed: readonly string[],
  fields: Record<string, string>,
  key: string,
): string | null {
  if (typeof value === "string" && allowed.includes(value)) return value;
  fields[key] = GENERIC;
  return null;
}

function optionalEnum(
  value: unknown,
  allowed: readonly string[],
  fields: Record<string, string>,
  key: string,
): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" && allowed.includes(value)) return value;
  fields[key] = GENERIC;
  return null;
}

function parseUtm(value: unknown, fields: Record<string, string>): Utm {
  const empty: Utm = { source: null, medium: null, campaign: null, content: null, term: null };
  if (value == null) return empty;
  if (typeof value !== "object" || Array.isArray(value)) {
    fields["utm"] = GENERIC;
    return empty;
  }
  const raw = value as Record<string, unknown>;
  const keys = ["source", "medium", "campaign", "content", "term"] as const;
  const result: Utm = { ...empty };
  for (const k of keys) {
    const v = raw[k];
    if (v == null || v === "") continue;
    if (typeof v !== "string" || v.trim().length > LIMITS.utm || hasControlChars(v.trim())) {
      fields[`utm.${k}`] = "UTM value is invalid or too long.";
      continue;
    }
    result[k] = v.trim();
  }
  return result;
}

/**
 * Validate and normalize a raw request body into a WaitlistValue, or return
 * PII-safe per-field error messages. Unknown/extra keys are ignored (they are
 * simply not persisted) — required-field validation is what gates acceptance.
 */
export function parseWaitlist(body: Record<string, unknown>): ParseResult {
  const fields: Record<string, string> = {};

  const fullName = requiredText(body.fullName, LIMITS.fullName, fields, "fullName");

  let email: string | null = null;
  if (typeof body.email !== "string") {
    fields["email"] = "Enter a valid work email.";
  } else {
    // Preserve submitted casing so durable applications rows match exact-email
    // queries from operators/E2E (markers may include uppercase ISO "T", etc.).
    const trimmed = body.email.trim();
    const forValidation = trimmed.toLowerCase();
    if (
      forValidation.length < 3 ||
      forValidation.length > LIMITS.email ||
      hasControlChars(trimmed) ||
      !isEmail(forValidation)
    ) {
      fields["email"] = "Enter a valid work email.";
    } else {
      email = trimmed;
    }
  }

  const companyName = requiredText(body.companyName, LIMITS.companyName, fields, "companyName");

  let productUrl: string | null = null;
  if (typeof body.productUrl !== "string" || body.productUrl.trim().length > LIMITS.productUrl) {
    fields["productUrl"] = "Enter a valid HTTPS product URL.";
  } else {
    const normalized = normalizeHttpsUrl(body.productUrl);
    if (!normalized) {
      fields["productUrl"] = "Enter a valid HTTPS product URL.";
    } else {
      productUrl = normalized;
    }
  }

  const role = optionalText(body.role, LIMITS.role, fields, "role");
  const prototypePlatform = optionalText(
    body.prototypePlatform,
    LIMITS.prototypePlatform,
    fields,
    "prototypePlatform",
  );
  const stage = enumValue(body.stage, LEAD_STAGES, fields, "stage");
  const primaryBlocker = enumValue(body.primaryBlocker, LEAD_BLOCKERS, fields, "primaryBlocker");
  const desiredStart = enumValue(
    body.desiredStartWindow,
    DESIRED_START_WINDOWS,
    fields,
    "desiredStartWindow",
  );
  const budgetRange = optionalEnum(body.budgetRange, BUDGET_RANGES, fields, "budgetRange");
  const message = requiredText(body.message, LIMITS.message, fields, "message", {
    allowMultilineWhitespace: true,
  });

  if (body.privacyAccepted !== true) {
    fields["privacyAccepted"] = "Privacy acceptance is required.";
  }

  const landingPage = optionalText(body.landingPage, LIMITS.landingPage, fields, "landingPage");
  const referrer = optionalText(body.referrer, LIMITS.referrer, fields, "referrer");
  const utm = parseUtm(body.utm, fields);

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }

  return {
    ok: true,
    value: {
      email: email!,
      fullName: fullName!,
      companyName: companyName!,
      role,
      productUrl: productUrl!,
      prototypePlatform,
      stage: stage!,
      primaryBlocker: primaryBlocker!,
      desiredStart: desiredStart!,
      budgetRange,
      commercialDeadline: body.commercialDeadline === true,
      message: message!,
      marketingConsent: body.marketingConsent === true,
      landingPage,
      referrer,
      utm,
    },
  };
}

/** Honeypot: a non-empty `website` field is an abuse signal (never persisted). */
export function isHoneypotTripped(body: Record<string, unknown>): boolean {
  return typeof body.website === "string" && body.website.trim() !== "";
}
