/**
 * Shared Readiness Report schema — the versioned contract used by BOTH the
 * prompt generator and the parser so they cannot drift.
 *
 * Contract delimiters (v1):
 *   === VYGO-READINESS-REPORT v1 ===
 *   ...fixed fields...
 *   === END VYGO-READINESS-REPORT ===
 *
 * Do not rename fields without bumping the contract version (v1 → v2).
 */
import { z } from "zod";

/** Opening delimiter for a v1 readiness report document. */
export const READINESS_REPORT_V1_START = "=== VYGO-READINESS-REPORT v1 ===" as const;

/** Closing delimiter for a v1 readiness report document. */
export const READINESS_REPORT_V1_END = "=== END VYGO-READINESS-REPORT ===" as const;

export const READINESS_REPORT_CONTRACT_VERSION = 1 as const;

/**
 * Fixed field names for the v1 contract, in canonical order.
 * Renames require a version bump.
 */
export const READINESS_REPORT_V1_FIELDS = [
  "summary",
  "languages",
  "size",
  "structure",
  "frontend",
  "backend",
  "database",
  "tenancy",
  "auth",
  "authorization",
  "row_level_security",
  "environments",
  "deploys",
  "tests",
  "background_jobs",
  "integrations",
  "secrets_pattern",
  "logging",
  "error_handling",
  "pii_categories",
  "api_surface",
  "fragility_flags",
  "confidence",
] as const;

export type ReadinessReportV1Field = (typeof READINESS_REPORT_V1_FIELDS)[number];

/** Free-text / structured string fields (most of the report). */
const reportTextField = z.string();

/**
 * Zod schema for the parsed v1 report body (fields only, no delimiters).
 * Values are strings so prompt/parser round-trips stay simple; nested JSON may
 * be stringified by producers. `confidence` is a number in [0, 1].
 * `fragility_flags` may be a string or string array.
 */
export const readinessReportV1Schema = z
  .object({
    summary: reportTextField,
    languages: reportTextField,
    size: reportTextField,
    structure: reportTextField,
    frontend: reportTextField,
    backend: reportTextField,
    database: reportTextField,
    tenancy: reportTextField,
    auth: reportTextField,
    authorization: reportTextField,
    row_level_security: reportTextField,
    environments: reportTextField,
    deploys: reportTextField,
    tests: reportTextField,
    background_jobs: reportTextField,
    integrations: reportTextField,
    secrets_pattern: reportTextField,
    logging: reportTextField,
    error_handling: reportTextField,
    pii_categories: reportTextField,
    api_surface: reportTextField,
    fragility_flags: z.union([reportTextField, z.array(z.string())]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ReadinessReportV1 = z.infer<typeof readinessReportV1Schema>;

/** Partial form used while drafting / streaming parse. */
export const readinessReportV1PartialSchema = readinessReportV1Schema.partial();

export type ReadinessReportV1Partial = z.infer<typeof readinessReportV1PartialSchema>;

/**
 * Serialize a v1 report object into the delimited contract document.
 * Unknown keys are dropped; field order follows READINESS_REPORT_V1_FIELDS.
 */
export function formatReadinessReportV1(report: ReadinessReportV1): string {
  const lines: string[] = [READINESS_REPORT_V1_START];
  for (const key of READINESS_REPORT_V1_FIELDS) {
    const value = report[key];
    if (key === "fragility_flags" && Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (key === "confidence") {
      lines.push(`${key}: ${String(value)}`);
    } else {
      lines.push(`${key}: ${String(value ?? "")}`);
    }
  }
  lines.push(READINESS_REPORT_V1_END);
  return lines.join("\n");
}

/**
 * Extract the v1 delimited block from free text (if present).
 * Returns null when delimiters are missing or unordered.
 */
export function extractReadinessReportV1Block(text: string): string | null {
  const start = text.indexOf(READINESS_REPORT_V1_START);
  if (start < 0) return null;
  const afterStart = start + READINESS_REPORT_V1_START.length;
  const end = text.indexOf(READINESS_REPORT_V1_END, afterStart);
  if (end < 0) return null;
  return text.slice(start, end + READINESS_REPORT_V1_END.length);
}

/**
 * Parse a delimited v1 report document (or free text containing one) into
 * the typed field object. Fail-closed: returns null on any structural error.
 */
export function parseReadinessReportV1(text: string): ReadinessReportV1 | null {
  const block = extractReadinessReportV1Block(text);
  if (!block) return null;
  const inner = block
    .slice(READINESS_REPORT_V1_START.length, block.length - READINESS_REPORT_V1_END.length)
    .trim();

  const fields: Record<string, unknown> = {};
  for (const line of inner.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();
    if (!(READINESS_REPORT_V1_FIELDS as readonly string[]).includes(key)) continue;
    if (key === "confidence") {
      const n = Number(rawValue);
      fields[key] = Number.isFinite(n) ? n : rawValue;
    } else if (key === "fragility_flags") {
      if (rawValue.startsWith("[")) {
        try {
          fields[key] = JSON.parse(rawValue) as unknown;
        } catch {
          fields[key] = rawValue;
        }
      } else {
        fields[key] = rawValue;
      }
    } else {
      fields[key] = rawValue;
    }
  }

  const parsed = readinessReportV1Schema.safeParse(fields);
  return parsed.success ? parsed.data : null;
}
