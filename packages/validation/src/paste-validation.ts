/**
 * Stage 3 paste-boundary validation.
 *
 * The single authoritative gate that decides whether a pasted submission is a
 * genuine, complete VYGO-READINESS-REPORT — the only input allowed to advance
 * the flow into structured findings and Confirm findings.
 *
 * A submission is accepted ONLY when it:
 *   1. contains the exact begin marker line  (=== VYGO-READINESS-REPORT v1 ===)
 *   2. contains the exact end   marker line  (=== END VYGO-READINESS-REPORT ===)
 *      appearing AFTER the begin marker, and
 *   3. parses cleanly against the existing v1 schema/parser rules
 *      (parseReadinessReportV1 → non-null).
 *
 * Everything else — placeholder text ("Analysis completed."), missing markers,
 * truncated reports, and other incomplete or malformed submissions — is invalid
 * user input. The result carries a machine reason so the UI can show a
 * recoverable validation message while preserving the exact paste for correction.
 *
 * Deliberately does NOT run ensureReportFooter: fabricating a missing end marker
 * would let a truncated report (begin marker only) pass, which the boundary must
 * reject. Chat wrapping and markdown fences ARE tolerated (stripMarkdownFences /
 * unwrapChatLineWrapping) so the established valid-report paste workflow — a
 * report wrapped in assistant prose or a code fence — keeps working.
 */
import { stripMarkdownFences, unwrapChatLineWrapping } from "./paste-normalize.js";
import {
  READINESS_REPORT_V1_END,
  READINESS_REPORT_V1_START,
  parseReadinessReportV1,
  type ReadinessReportV1,
} from "./report-schema.js";

/** Why a paste failed the readiness-report boundary. */
export type ReadinessPasteInvalidReason =
  "empty" | "missing-begin-marker" | "missing-end-marker" | "schema-invalid";

/** Result of validating a Stage 3 paste against the report boundary. */
export type ReadinessPasteValidation =
  | {
      valid: true;
      /** The schema-complete report, ready to render structured findings. */
      report: ReadinessReportV1;
      /** The cleaned (fence/chat-unwrapped) text that parsed. */
      normalized: string;
    }
  | {
      valid: false;
      reason: ReadinessPasteInvalidReason;
    };

/**
 * Recoverable, user-facing messages per invalid reason. Each tells the user what
 * is wrong AND how to fix it, and every message keeps the exact paste in place so
 * they can correct it. No message advances the flow.
 */
export const READINESS_PASTE_VALIDATION_MESSAGES: Record<ReadinessPasteInvalidReason, string> = {
  empty: "Paste your readiness report before submitting — nothing was entered yet.",
  "missing-begin-marker": `This doesn't look like a readiness report. Paste the complete block, including the begin marker line "${READINESS_REPORT_V1_START}" and the matching end marker.`,
  "missing-end-marker": `This report is missing its end marker line "${READINESS_REPORT_V1_END}". It looks truncated — paste the complete block including both marker lines.`,
  "schema-invalid": `We found the report markers but couldn't read a valid readiness report between them. Paste the full, unedited block your AI produced and try again.`,
};

/** Look up the recoverable validation message for an invalid reason. */
export function readinessPasteValidationMessage(reason: ReadinessPasteInvalidReason): string {
  return READINESS_PASTE_VALIDATION_MESSAGES[reason];
}

/**
 * Validate a raw Stage 3 paste against the readiness-report boundary. Pure and
 * total: never throws. On success returns the parsed report; on failure returns
 * a specific reason. This is the ONLY predicate the paste boundary should use to
 * decide whether a submission may create findings and unlock Confirm findings.
 */
export function validateReadinessReportPaste(raw: unknown): ReadinessPasteValidation {
  if (typeof raw !== "string" || !raw.trim()) {
    return { valid: false, reason: "empty" };
  }

  // Tolerate chat wrapping and markdown fences, but never fabricate a missing
  // end marker — a truncated report must stay rejected.
  let text = stripMarkdownFences(raw);
  text = unwrapChatLineWrapping(text);
  text = text.trim();

  const startIdx = text.indexOf(READINESS_REPORT_V1_START);
  if (startIdx < 0) {
    return { valid: false, reason: "missing-begin-marker" };
  }
  const endIdx = text.indexOf(READINESS_REPORT_V1_END, startIdx + READINESS_REPORT_V1_START.length);
  if (endIdx < 0) {
    return { valid: false, reason: "missing-end-marker" };
  }

  const report = parseReadinessReportV1(text);
  if (!report) {
    return { valid: false, reason: "schema-invalid" };
  }

  return { valid: true, report, normalized: text };
}
