/**
 * Findings inference for the Readiness "Confirm findings" (Step 8) screen.
 *
 * The parse pipeline hands us findings as opaque strings shaped like
 * `"Area: free text describing state"` (see `buildConfirmationFindings` in
 * @vygo/validation). This module turns each raw string into a structured row:
 *   - a severity (attention | warning | ok | neutral) inferred from wording,
 *   - a human area label (from the prefix, or inferred from content),
 *   - a short bold summary phrase, and
 *   - the full detail text.
 *
 * All functions here are pure so they can be unit-tested without React. Nothing
 * is ever dropped: a finding whose severity cannot be read renders `neutral`.
 */

export type FindingSeverity = "attention" | "warning" | "ok" | "neutral";

export interface ParsedFinding {
  /** Original finding string, verbatim. */
  raw: string;
  severity: FindingSeverity;
  /** Display label for the area chip (e.g. "Auth", "Deploy", "Security"). */
  area: string;
  /** Short, bold lead phrase. */
  summary: string;
  /** Full finding text (area prefix stripped), shown in regular weight. */
  detail: string;
}

/** Sort weight: attention first, then warning, then ok, then neutral/info. */
const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  attention: 0,
  warning: 1,
  ok: 2,
  neutral: 3,
};

/** Canonical, reader-friendly area labels keyed by lowercased prefix. */
const AREA_LABELS: Record<string, string> = {
  auth: "Auth",
  authentication: "Auth",
  database: "Data",
  data: "Data",
  db: "Data",
  storage: "Data",
  deploy: "Deploy",
  deploys: "Deploy",
  deployment: "Deploy",
  hosting: "Deploy",
  infra: "Deploy",
  tests: "Testing",
  test: "Testing",
  testing: "Testing",
  tenancy: "Tenancy",
  secrets: "Security",
  security: "Security",
  frontend: "Frontend",
  ui: "Frontend",
  backend: "API",
  api: "API",
  server: "API",
  integrations: "API",
  fragility: "Risk",
  risk: "Risk",
  summary: "Overview",
  overview: "Overview",
};

/** Keyword → area, used when a finding has no explicit `Area:` prefix. */
const AREA_KEYWORDS: { re: RegExp; area: string }[] = [
  { re: /\b(auth|login|sign[- ]?in|oauth|session|mfa|password|jwt|token)\b/i, area: "Auth" },
  { re: /\b(secret|api key|credential|encrypt|vault|\.env|exposed)\b/i, area: "Security" },
  { re: /\b(deploy|hosting|railway|vercel|ci\/cd|pipeline|docker|build)\b/i, area: "Deploy" },
  { re: /\b(database|postgres|mysql|mongo|sqlite|schema|migration|query)\b/i, area: "Data" },
  { re: /\b(test|coverage|jest|vitest|e2e|unit test)\b/i, area: "Testing" },
  { re: /\b(api|endpoint|backend|route|rest|graphql|server)\b/i, area: "API" },
  { re: /\b(frontend|react|component|ui|css|tailwind|render)\b/i, area: "Frontend" },
];

/** Readings that look negative but are actually fine ("no issues found"). */
const OK_OVERRIDE = /\bno\s+(issues?|problems?|concerns?|blockers?|gaps?|risks?)\b/i;

const ATTENTION_RE =
  /\b(no(?!\s+(?:issues?|problems?|concerns?|blockers?|gaps?|risks?))|none|missing|lacks?|lacking|without|absent|insecure|vulnerab\w*|exposed|hard[- ]?coded|plain[- ]?text|leak\w*|critical|broken|fails?|failing|fragile|unprotected|single point|blocker|severe|todo)\b/i;

const WARNING_RE =
  /\b(partial\w*|unclear|unknown|minimal|basic|manual\w*|limited|needs?|should|consider|outdated|deprecated|incomplete|mixed|sparse|weak|thin|low|caution|review|no ci)\b/i;

const OK_RE =
  /\b(configured|enabled|present|implemented|secured?|covered|automated|in place|protected|managed|complete|passing|healthy|robust|comprehensive|strong|good|solid|ready)\b/i;

/** Infer severity from the free-text wording of a finding value. */
export function inferSeverity(text: string): FindingSeverity {
  const t = text.trim();
  if (!t) return "neutral";
  if (OK_OVERRIDE.test(t)) return "ok";
  if (ATTENTION_RE.test(t)) return "attention";
  if (WARNING_RE.test(t)) return "warning";
  if (OK_RE.test(t)) return "ok";
  return "neutral";
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Resolve a display area from an explicit prefix or the body text. */
export function inferArea(prefix: string | null, body: string): string {
  if (prefix) {
    const key = prefix.trim().toLowerCase();
    if (AREA_LABELS[key]) return AREA_LABELS[key];
    if (key.length > 0) return titleCase(prefix.trim());
  }
  for (const { re, area } of AREA_KEYWORDS) {
    if (re.test(body)) return area;
  }
  return "General";
}

/** Derive a short bold lead phrase from the body of a finding. */
export function summarize(body: string, maxLen = 60): string {
  const text = body.trim();
  if (!text) return "";
  // First clause up to a sentence/segment boundary.
  const clause = (text.split(/(?:\. |; | — |, )/)[0] ?? text).trim() || text;
  const lead = clause.length <= maxLen ? clause : clause.slice(0, maxLen).replace(/\s+\S*$/, "");
  const phrase = (lead || clause).trim();
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Parse one raw finding string into a structured row. */
export function parseFinding(raw: string): ParsedFinding {
  const trimmed = raw.trim();
  // Split an "Area: value" prefix only when the label is a short single token/phrase.
  const match = trimmed.match(/^([A-Za-z][\w &/-]{0,24}):\s*(.+)$/s);
  const prefix = match ? (match[1] ?? null) : null;
  const body = (match ? (match[2] ?? trimmed) : trimmed).trim();
  const severity = inferSeverity(body);
  const area = inferArea(prefix, body);
  const summary = summarize(body) || area;
  return { raw, severity, area, summary, detail: body };
}

/**
 * Parse and order every finding severity-first (attention → warning → ok →
 * neutral). Stable within a severity so the original order is preserved.
 * Never drops a finding — the returned length always equals the input length.
 */
export function parseFindings(raw: string[]): ParsedFinding[] {
  return raw
    .map((r, index) => ({ finding: parseFinding(r), index }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity];
      return bySeverity !== 0 ? bySeverity : a.index - b.index;
    })
    .map((entry) => entry.finding);
}

export interface FindingCounts {
  attention: number;
  warning: number;
  ok: number;
  neutral: number;
}

export function countBySeverity(findings: ParsedFinding[]): FindingCounts {
  const counts: FindingCounts = { attention: 0, warning: 0, ok: 0, neutral: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** Human count summary, e.g. "2 need attention · 3 warnings · 4 ok". */
export function summarizeCounts(counts: FindingCounts): string {
  const parts: string[] = [];
  if (counts.attention > 0) parts.push(`${counts.attention} need attention`);
  if (counts.warning > 0)
    parts.push(`${counts.warning} ${counts.warning === 1 ? "warning" : "warnings"}`);
  if (counts.ok > 0) parts.push(`${counts.ok} ok`);
  if (counts.neutral > 0) parts.push(`${counts.neutral} info`);
  return parts.join(" · ");
}
