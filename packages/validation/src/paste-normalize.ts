/**
 * Normalize sloppy readiness report pastes (chat wrapping, markdown fences,
 * missing footer) before parse. Does not invent field values.
 */
import {
  READINESS_REPORT_V1_END,
  READINESS_REPORT_V1_START,
  parseReadinessReportV1,
  type ReadinessReportV1,
  type ReadinessReportV1Partial,
} from "./report-schema.js";

/**
 * Strip common markdown code fences and leading/trailing chatter so the
 * delimited report (or loose field lines) can be parsed.
 */
export function stripMarkdownFences(text: string): string {
  if (!text) return text;
  let out = text.replace(/\r\n/g, "\n");
  // Full-document fenced block
  const fullFence = out.match(/^```(?:[\w.-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fullFence?.[1] != null) {
    return fullFence[1].trim();
  }
  // Remove opening/closing fences anywhere
  out = out.replace(/^```(?:[\w.-]+)?\s*$/gm, "");
  out = out.replace(/^```\s*$/gm, "");
  return out.trim();
}

/**
 * Soft-unwrap chat client line wrapping: if a non-field line continues a
 * previous field value (no colon key), append it to the prior line.
 * Conservative — only joins when the previous line looks like a field line
 * and the current line does not.
 */
export function unwrapChatLineWrapping(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const fieldStart = /^[a-z_][a-z0-9_]*\s*:/i;
  const delimiter = /^=+\s*(?:VYGO|END)/i;
  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      merged.push(line);
      continue;
    }
    if (delimiter.test(trimmed) || fieldStart.test(trimmed) || trimmed.startsWith("#")) {
      merged.push(line);
      continue;
    }
    // Continuation of previous field value
    if (merged.length > 0) {
      const prev = merged[merged.length - 1] ?? "";
      if (fieldStart.test(prev.trim()) && !delimiter.test(prev.trim())) {
        merged[merged.length - 1] = `${prev} ${trimmed}`;
        continue;
      }
    }
    merged.push(line);
  }
  return merged.join("\n");
}

/**
 * If the start delimiter is present but the end is missing, append the end
 * delimiter so strict parse can still attempt field extraction.
 */
export function ensureReportFooter(text: string): string {
  const hasStart = text.includes(READINESS_REPORT_V1_START);
  const hasEnd = text.includes(READINESS_REPORT_V1_END);
  if (hasStart && !hasEnd) {
    return `${text.trimEnd()}\n${READINESS_REPORT_V1_END}`;
  }
  return text;
}

/**
 * Full normalize pipeline for paste-back input.
 */
export function normalizeReadinessPaste(raw: string): string {
  let text = stripMarkdownFences(raw);
  text = unwrapChatLineWrapping(text);
  text = ensureReportFooter(text);
  return text.trim();
}

/**
 * Attempt a best-effort parse after normalize. Returns null when no usable
 * report can be extracted.
 */
export function parseNormalizedReadinessPaste(raw: string): ReadinessReportV1 | null {
  const normalized = normalizeReadinessPaste(raw);
  const strict = parseReadinessReportV1(normalized);
  if (strict) return strict;
  // Loose: extract key: value lines without requiring every field
  return null;
}

/**
 * Loose partial parse for confirmation UI when full schema is incomplete
 * (e.g. missing footer fields). Never throws.
 */
export function parseReadinessPastePartial(raw: string): ReadinessReportV1Partial {
  const normalized = normalizeReadinessPaste(raw);
  const strict = parseReadinessReportV1(normalized);
  if (strict) return strict;

  const fields: ReadinessReportV1Partial = {};
  // Prefer content inside delimiters if start is present
  let body = normalized;
  const startIdx = body.indexOf(READINESS_REPORT_V1_START);
  if (startIdx >= 0) {
    body = body.slice(startIdx + READINESS_REPORT_V1_START.length);
    const endIdx = body.indexOf(READINESS_REPORT_V1_END);
    if (endIdx >= 0) body = body.slice(0, endIdx);
  }

  const known = new Set([
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
  ]);

  for (const line of body.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("===")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();
    if (!known.has(key) || !rawValue) continue;
    if (key === "confidence") {
      const n = Number(rawValue);
      if (Number.isFinite(n)) fields.confidence = Math.min(1, Math.max(0, n));
    } else if (key === "fragility_flags") {
      if (rawValue.startsWith("[")) {
        try {
          fields.fragility_flags = JSON.parse(rawValue) as string[];
        } catch {
          fields.fragility_flags = rawValue;
        }
      } else {
        fields.fragility_flags = rawValue;
      }
    } else {
      (fields as Record<string, string>)[key] = rawValue;
    }
  }
  return fields;
}

/** Build 4–6 human findings from a partial report for the confirmation screen. */
export function buildConfirmationFindings(report: ReadinessReportV1Partial, max = 6): string[] {
  const findings: string[] = [];
  const push = (label: string, value: unknown) => {
    if (findings.length >= max) return;
    if (value == null) return;
    const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value).trim();
    if (!text || text.toUpperCase() === "UNKNOWN") return;
    findings.push(`${label}: ${text}`);
  };

  push("Auth", report.auth);
  push("Database", report.database);
  push("Deploy", report.deploys);
  push("Tests", report.tests);
  push("Tenancy", report.tenancy);
  push("Secrets", report.secrets_pattern);
  push("Frontend", report.frontend);
  push("Backend", report.backend);
  push("Integrations", report.integrations);
  if (report.fragility_flags) {
    const flags = Array.isArray(report.fragility_flags)
      ? report.fragility_flags.join(", ")
      : String(report.fragility_flags);
    if (flags.trim() && flags.toUpperCase() !== "UNKNOWN") {
      push("Fragility", flags);
    }
  }
  if (report.summary && findings.length < 4) {
    push("Summary", report.summary);
  }
  return findings.slice(0, max);
}

export function describeStack(report: ReadinessReportV1Partial): string {
  const parts = [report.languages, report.frontend, report.backend].filter(
    (p): p is string =>
      typeof p === "string" && p.trim().length > 0 && p.toUpperCase() !== "UNKNOWN",
  );
  if (parts.length === 0) return "Not yet determined";
  // Dedupe similar tokens loosely
  return [...new Set(parts.map((p) => p.trim()))].join(" · ");
}

export function describeSize(report: ReadinessReportV1Partial): string {
  const size = typeof report.size === "string" ? report.size.trim() : "";
  if (!size || size.toUpperCase() === "UNKNOWN") return "Not yet determined";
  return size;
}
