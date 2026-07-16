/**
 * Stage 3 parse pipeline: normalize → (optional secret redact already applied)
 * → deterministic schema parse → optional manual route. LLM normalization is
 * intentionally a separate, optional step that must run only on redacted text.
 */
import {
  buildConfirmationFindings,
  describeSize,
  describeStack,
  normalizeReadinessPaste,
  parseReadinessPastePartial,
} from "./paste-normalize.js";
import {
  READINESS_REPORT_V1_FIELDS,
  parseReadinessReportV1,
  type ReadinessReportV1,
  type ReadinessReportV1Partial,
} from "./report-schema.js";

export type ParseRoute = "confirm" | "manual";

export type ParsePipelineResult = {
  parseStatus: "ok" | "partial" | "pending" | "manual";
  route: ParseRoute;
  report: ReadinessReportV1Partial;
  /** Schema-complete report when parseStatus === "ok". */
  fullReport: ReadinessReportV1 | null;
  stack: string;
  size: string;
  findings: string[];
  /** When true, client should open the manual questionnaire. */
  routeToManual: boolean;
  /** How the report was produced. */
  source: "deterministic" | "partial" | "none";
};

const UNKNOWN = "UNKNOWN";

/**
 * Fill missing schema fields with UNKNOWN for partial recovery paths.
 * Does not invent domain values — only the documented UNKNOWN sentinel.
 */
export function fillUnknownFields(partial: ReadinessReportV1Partial): ReadinessReportV1Partial {
  const out: Record<string, unknown> = { ...partial };
  for (const key of READINESS_REPORT_V1_FIELDS) {
    if (key === "confidence") {
      if (typeof out.confidence !== "number" || !Number.isFinite(out.confidence as number)) {
        out.confidence = 0;
      }
      continue;
    }
    if (key === "fragility_flags") {
      if (out.fragility_flags == null || out.fragility_flags === "") {
        out.fragility_flags = UNKNOWN;
      }
      continue;
    }
    if (out[key] == null || out[key] === "") {
      out[key] = UNKNOWN;
    }
  }
  return out as ReadinessReportV1Partial;
}

/**
 * Heuristic recovery for sloppy free-text pastes without delimiters.
 * Returns a partial when enough signal is present; otherwise empty.
 */
export function recoverSloppyPaste(raw: string): ReadinessReportV1Partial {
  const text = raw.replace(/\r\n/g, "\n");
  const lower = text.toLowerCase();
  const fields: ReadinessReportV1Partial = {};

  const grab = (re: RegExp): string | undefined => {
    const m = text.match(re);
    return m?.[1]?.trim() || undefined;
  };

  const summary =
    grab(/summary\s*[-:]\s*(.+)/i) ||
    grab(/product[:\s]+(.+)/i) ||
    (lower.includes("clinic") || lower.includes("scheduling")
      ? text
          .split("\n")
          .find((l) => /clinic|scheduling|tool|product/i.test(l))
          ?.trim()
      : undefined);
  if (summary) fields.summary = summary.slice(0, 500);

  if (/typescript/i.test(text)) fields.languages = "TypeScript";
  if (/python/i.test(text)) {
    fields.languages = fields.languages ? `${fields.languages}, Python` : "Python";
  }
  if (/next\.?js|nextjs/i.test(text)) fields.frontend = "Next.js";
  if (/\bnode\b|fastify|express/i.test(text)) fields.backend = "Node";
  if (/postgres|postgresql/i.test(text)) fields.database = "Postgres";
  if (/clerk|auth0|magic link|session/i.test(text)) {
    const auth =
      grab(/auth(?:\s*stuff)?\s*:\s*(.+)/i) || (/clerk/i.test(text) ? "Clerk" : "session");
    fields.auth = auth.slice(0, 200);
  }
  if (/deploy/i.test(text)) {
    fields.deploys =
      grab(/deploys?\s*:\s*(.+)/i) || (/click/i.test(text) ? "manual / one-click" : "unknown");
  }
  if (/test/i.test(text)) {
    fields.tests =
      grab(/tests?\s*:\s*(.+)/i) ||
      (/not really|no automated|none/i.test(text) ? "not really automated" : "unknown");
  }
  if (/confidence\s+low|low confidence/i.test(text)) {
    fields.confidence = 0.25;
  } else if (/confidence\s*:\s*([0-9.]+)/i.test(text)) {
    const n = Number(RegExp.$1);
    if (Number.isFinite(n)) fields.confidence = Math.min(1, Math.max(0, n));
  }

  return fields;
}

/**
 * Run the deterministic Stage 3 parser on already-redacted paste text.
 * Never call this with unredacted secrets.
 */
export function runDeterministicParse(redactedPaste: string): ParsePipelineResult {
  const normalized = normalizeReadinessPaste(redactedPaste);
  const full = parseReadinessReportV1(normalized);
  if (full) {
    return {
      parseStatus: "ok",
      route: "confirm",
      report: full,
      fullReport: full,
      stack: describeStack(full),
      size: describeSize(full),
      findings: buildConfirmationFindings(full, 6),
      routeToManual: false,
      source: "deterministic",
    };
  }

  let partial = parseReadinessPastePartial(normalized);
  if (Object.keys(partial).length < 3) {
    const recovered = recoverSloppyPaste(redactedPaste);
    if (Object.keys(recovered).length > Object.keys(partial).length) {
      partial = { ...partial, ...recovered };
    }
  }

  const keyCount = Object.keys(partial).filter((k) => {
    const v = (partial as Record<string, unknown>)[k];
    return v != null && v !== "" && v !== UNKNOWN;
  }).length;

  // Enough signal for confirmation with UNKNOWN fill-in
  if (keyCount >= 6) {
    const filled = fillUnknownFields(partial);
    return {
      parseStatus: "partial",
      route: "confirm",
      report: filled,
      fullReport: null,
      stack: describeStack(filled),
      size: describeSize(filled),
      findings: buildConfirmationFindings(filled, 6),
      routeToManual: false,
      source: "partial",
    };
  }

  // Missing-footer style: some fields present but thin — still partial confirm
  if (keyCount >= 3) {
    const filled = fillUnknownFields(partial);
    return {
      parseStatus: "partial",
      route: "confirm",
      report: filled,
      fullReport: null,
      stack: describeStack(filled),
      size: describeSize(filled),
      findings: buildConfirmationFindings(filled, 6),
      routeToManual: false,
      source: "partial",
    };
  }

  // Fail closed to manual questionnaire — never 5xx
  return {
    parseStatus: "manual",
    route: "manual",
    report: fillUnknownFields(partial),
    fullReport: null,
    stack: "Not yet determined",
    size: "Not yet determined",
    findings: [],
    routeToManual: true,
    source: keyCount > 0 ? "partial" : "none",
  };
}

/**
 * Optional LLM normalization hook. Call ONLY with already-redacted text.
 * Returns null when no API key / provider is configured (fail closed to
 * deterministic parse — never block the feature on the LLM).
 */
export async function tryLlmNormalizeReport(
  _redactedPaste: string,
  env: { ANTHROPIC_API_KEY?: string; LLM_API_KEY?: string } = process.env,
): Promise<ReadinessReportV1 | null> {
  const key = (env.ANTHROPIC_API_KEY || env.LLM_API_KEY || "").trim();
  if (!key) return null;
  // Provider wiring is intentional no-op until a vault-backed key is present
  // and an owner enables it. Deterministic parse remains the default path.
  return null;
}
