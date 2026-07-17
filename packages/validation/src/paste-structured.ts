/**
 * Structured/normalized view of a Stage 3 readiness paste for the Step 8
 * "Confirm findings" screen.
 *
 * This is a PURE, side-effect-free parsing layer. It converts the already
 * loosely-parsed diagnostic report (or the raw pasted text) into structured
 * display data:
 *   (a) stack  -> typed technology entries { name, category }
 *   (b) size   -> numeric metrics { label, value, unit } + a coarse
 *                 classification ('small' | 'medium' | 'large')
 *   (c) findings -> items { area, text, severity }
 *
 * The parser NEVER throws and NEVER drops the underlying text: the raw paste,
 * today's free-text stack/size paragraphs and the plain findings bullet
 * strings are all preserved on the result so nothing is lost when parsing is
 * partial, uncertain, or fails outright. It performs NO UI work — the Step 8
 * screen continues to render exactly as before from the free-text fields.
 */
import {
  buildConfirmationFindings,
  describeSize,
  describeStack,
  parseReadinessPastePartial,
} from "./paste-normalize.js";
import type { ReadinessReportV1Partial } from "./report-schema.js";

/** Technology category buckets for a parsed stack entry. */
export type StackCategory = "language" | "framework" | "ui" | "auth" | "infra" | "deploy";

/** A single normalized technology detected in the pasted stack description. */
export interface StackEntry {
  /** Canonical display name, e.g. "Next.js 15", "React 19", "Supabase". */
  name: string;
  /** Coarse category bucket. */
  category: StackCategory;
}

/** Overall project-size classification derived from the size description. */
export type SizeClassification = "small" | "medium" | "large";

/** A single numeric metric parsed from the free-text size description. */
export interface SizeMetric {
  /** Human label, e.g. "git-tracked files", "TS/TSX modules". */
  label: string;
  /** Numeric value (scale suffixes like "k"/"m" are expanded). */
  value: number;
  /** Unit noun, e.g. "files", "modules", "apps". */
  unit: string;
}

/** Structured size view: metrics plus an overall classification. */
export interface StructuredSize {
  /** Raw size free-text, preserved verbatim (today's paragraph). */
  text: string;
  /** Numeric metrics parsed from the text (may be empty). */
  metrics: SizeMetric[];
  /** Coarse classification, or null when it cannot be determined. */
  classification: SizeClassification | null;
}

/** Severity bucket for a categorized finding. `info` is the safe fallback. */
export type FindingSeverity = "ok" | "warning" | "attention" | "info";

/** A single normalized finding for the confirm screen. */
export interface StructuredFinding {
  /** Area label, e.g. "Auth", "Deploy". Falls back to "uncategorized". */
  area: string;
  /** The finding text, preserved verbatim (never altered or dropped). */
  text: string;
  /** Severity bucket; "info" when parsing is uncertain. */
  severity: FindingSeverity;
}

/**
 * Full structured view of a readiness paste. The raw paste and today's
 * free-text/bullet renderings are all preserved alongside the structured
 * data so the Step 8 UI can keep rendering unchanged and nothing is lost.
 */
export interface StructuredReadiness {
  /** The raw pasted text, verbatim. Ultimate fallback — never dropped. */
  raw: string;
  /** Typed technology entries parsed from the stack description. */
  stack: StackEntry[];
  /** Today's free-text stack paragraph (describeStack). */
  stackText: string;
  /** Structured size view (metrics + classification), with raw text kept. */
  size: StructuredSize;
  /** Typed findings parsed from the confirmation bullet strings. */
  findings: StructuredFinding[];
  /** Today's plain findings bullet strings, verbatim. */
  findingsText: string[];
}

/**
 * Technology dictionary. Order defines both matching precedence and the
 * resulting stack ordering. Each pattern may expose an optional version in
 * capture group 1, which is appended to the canonical name when present.
 */
interface TechPattern {
  re: RegExp;
  name: string;
  category: StackCategory;
}

const TECH_PATTERNS: TechPattern[] = [
  // Languages
  { re: /\btypescript\b/i, name: "TypeScript", category: "language" },
  { re: /\bjavascript\b/i, name: "JavaScript", category: "language" },
  { re: /\bpython\b/i, name: "Python", category: "language" },
  { re: /\bgolang\b/i, name: "Go", category: "language" },
  { re: /\brust\b/i, name: "Rust", category: "language" },
  { re: /\bruby\b(?!\s+on\s+rails)/i, name: "Ruby", category: "language" },
  { re: /\bjava\b(?!script)/i, name: "Java", category: "language" },
  { re: /\bphp\b/i, name: "PHP", category: "language" },
  { re: /\bkotlin\b/i, name: "Kotlin", category: "language" },
  { re: /\bswift\b/i, name: "Swift", category: "language" },
  { re: /\belixir\b/i, name: "Elixir", category: "language" },

  // Frameworks / runtimes
  { re: /\bnext\.?js\b\s*v?(\d+(?:\.\d+)*)?/i, name: "Next.js", category: "framework" },
  { re: /\bfastify\b/i, name: "Fastify", category: "framework" },
  { re: /\bexpress(?:\.js)?\b/i, name: "Express", category: "framework" },
  { re: /\bnest(?:\.?js)?\b/i, name: "NestJS", category: "framework" },
  { re: /\bremix\b/i, name: "Remix", category: "framework" },
  { re: /\bnuxt\b/i, name: "Nuxt", category: "framework" },
  { re: /\bastro\b/i, name: "Astro", category: "framework" },
  { re: /\bdjango\b/i, name: "Django", category: "framework" },
  { re: /\b(?:ruby\s+on\s+rails|rails)\b/i, name: "Rails", category: "framework" },
  { re: /\bflask\b/i, name: "Flask", category: "framework" },
  { re: /\bspring\s+boot\b/i, name: "Spring Boot", category: "framework" },
  { re: /\bnode(?:\.?js)?\b/i, name: "Node.js", category: "framework" },

  // UI / component libraries
  { re: /\breact\b\s*v?(\d+(?:\.\d+)*)?/i, name: "React", category: "ui" },
  { re: /\bvue(?:\.?js)?\b\s*v?(\d+(?:\.\d+)*)?/i, name: "Vue", category: "ui" },
  { re: /\bsvelte(?:kit)?\b/i, name: "Svelte", category: "ui" },
  { re: /\bangular\b/i, name: "Angular", category: "ui" },
  { re: /\bsolid(?:js)?\b/i, name: "SolidJS", category: "ui" },
  { re: /\btailwind(?:\s*css)?\b/i, name: "Tailwind", category: "ui" },
  { re: /\bshadcn(?:\/ui)?\b/i, name: "shadcn/ui", category: "ui" },
  { re: /\b(?:material[-\s]?ui|mui)\b/i, name: "Material UI", category: "ui" },
  { re: /\bchakra(?:\s*ui)?\b/i, name: "Chakra UI", category: "ui" },
  { re: /\bradix(?:\s*ui)?\b/i, name: "Radix UI", category: "ui" },
  { re: /\bbootstrap\b/i, name: "Bootstrap", category: "ui" },

  // Auth providers
  { re: /\bclerk\b/i, name: "Clerk", category: "auth" },
  { re: /\bauth0\b/i, name: "Auth0", category: "auth" },
  { re: /\bnext[-\s]?auth\b/i, name: "NextAuth", category: "auth" },
  { re: /\bcognito\b/i, name: "Cognito", category: "auth" },
  { re: /\bworkos\b/i, name: "WorkOS", category: "auth" },
  { re: /\bstytch\b/i, name: "Stytch", category: "auth" },
  { re: /\bkinde\b/i, name: "Kinde", category: "auth" },

  // Infra: data stores, backend services, edge
  { re: /\bsupabase\b/i, name: "Supabase", category: "infra" },
  { re: /\bpostgres(?:ql)?\b/i, name: "Postgres", category: "infra" },
  { re: /\bmysql\b/i, name: "MySQL", category: "infra" },
  { re: /\bsqlite\b/i, name: "SQLite", category: "infra" },
  { re: /\bmongo(?:db)?\b/i, name: "MongoDB", category: "infra" },
  { re: /\bredis\b/i, name: "Redis", category: "infra" },
  { re: /\bdrizzle\b/i, name: "Drizzle", category: "infra" },
  { re: /\bprisma\b/i, name: "Prisma", category: "infra" },
  { re: /\bfirebase\b/i, name: "Firebase", category: "infra" },
  { re: /\bcloudflare\s+turnstile\b/i, name: "Cloudflare Turnstile", category: "infra" },
  { re: /\bcloudflare\s+(?:r2|kv|d1|workers)\b/i, name: "Cloudflare Edge", category: "infra" },
  { re: /\bresend\b/i, name: "Resend", category: "infra" },
  { re: /\bstripe\b/i, name: "Stripe", category: "infra" },

  // Deploy targets / CI
  { re: /\bcloudflare\s+pages\b/i, name: "Cloudflare Pages", category: "deploy" },
  { re: /\bvercel\b/i, name: "Vercel", category: "deploy" },
  { re: /\brailway\b/i, name: "Railway", category: "deploy" },
  { re: /\bnetlify\b/i, name: "Netlify", category: "deploy" },
  { re: /\bfly\.io\b/i, name: "Fly.io", category: "deploy" },
  { re: /\brender\b/i, name: "Render", category: "deploy" },
  { re: /\bheroku\b/i, name: "Heroku", category: "deploy" },
  { re: /\bgithub\s+actions\b/i, name: "GitHub Actions", category: "deploy" },
  { re: /\bkubernetes\b|\bk8s\b/i, name: "Kubernetes", category: "deploy" },
  { re: /\bdocker\b/i, name: "Docker", category: "deploy" },
];

/** Stack-relevant report fields, joined to form the scan source. */
const STACK_FIELDS: (keyof ReadinessReportV1Partial)[] = [
  "languages",
  "frontend",
  "backend",
  "database",
  "deploys",
  "auth",
  "authorization",
  "integrations",
  "background_jobs",
  "structure",
];

/**
 * Build the text blob to scan for technologies from a parsed report, falling
 * back to arbitrary text (e.g. the raw paste) when no stack fields exist.
 */
export function stackSourceFromReport(report: ReadinessReportV1Partial, fallbackText = ""): string {
  const parts: string[] = [];
  for (const field of STACK_FIELDS) {
    const value = report[field];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  const joined = parts.join("\n");
  return joined.trim() || fallbackText;
}

/**
 * Scan a text blob for known technologies. Returns deduped entries in
 * dictionary order. Optional trailing version numbers are appended to the
 * canonical name (e.g. "Next.js 15").
 */
export function parseStackEntries(source: string): StackEntry[] {
  if (!source || typeof source !== "string") return [];
  const seen = new Set<string>();
  const entries: StackEntry[] = [];
  for (const pattern of TECH_PATTERNS) {
    const match = pattern.re.exec(source);
    if (!match) continue;
    const version = match[1]?.trim();
    const name = version ? `${pattern.name} ${version}` : pattern.name;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, category: pattern.category });
  }
  return entries;
}

/**
 * Parse numeric metrics from a free-text size description. Splits on commas /
 * semicolons / middots, then extracts a leading number (with optional k/m
 * scale and a "+" suffix) plus a descriptive label. Segments without a number
 * or without a descriptor are skipped. Never throws.
 */
export function parseSizeMetrics(sizeText: string): SizeMetric[] {
  if (!sizeText || typeof sizeText !== "string") return [];
  const metrics: SizeMetric[] = [];
  const segments = sizeText.split(/[,;]|\s+·\s+|\s+\/\s+/);
  for (const segment of segments) {
    const seg = segment.trim();
    if (!seg) continue;
    // A compact scale suffix (k/m) must attach directly to the number (e.g.
    // "40k", "2m"); the spelled-out forms may be spaced. This deliberately
    // avoids eating the first letter of a unit word — "12 modules" must not be
    // read as 12 million "odules".
    const m = seg.match(/(\d[\d,]*(?:\.\d+)?)([km])?\+?\s*(thousand|million)?\s*(.*)$/i);
    if (!m) continue;
    let value = Number.parseFloat((m[1] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const scale = `${m[2] ?? ""}${m[3] ?? ""}`.toLowerCase();
    if (scale === "k" || scale === "thousand") value *= 1000;
    if (scale === "m" || scale === "million") value *= 1_000_000;
    let label = (m[4] ?? "").trim();
    // Trim stray brackets/punctuation left by prose like "(~40k LOC)".
    label = label
      .replace(/^[^\w]+/, "")
      .replace(/[)\].]+$/, "")
      .trim();
    if (!label) continue;
    const unit = label.split(/\s+/).pop() ?? label;
    metrics.push({ label, value, unit });
  }
  return metrics;
}

/**
 * Derive a coarse size classification. Prefers an explicit keyword in the
 * text, then falls back to file/module/LOC counts. Returns null when neither
 * is available.
 */
export function classifyReadinessSize(
  sizeText: string,
  metrics: SizeMetric[] = [],
): SizeClassification | null {
  const t = (sizeText ?? "").toLowerCase();
  if (/\b(large|huge|massive|enterprise)\b/.test(t)) return "large";
  if (/\b(medium|mid[-\s]?size[d]?|moderate)\b/.test(t)) return "medium";
  if (/\b(small|tiny|minimal)\b/.test(t)) return "small";

  const counts = metrics
    .filter((m) => /\b(files?|modules?|loc|lines?|components?)\b/i.test(m.label))
    .map((m) => m.value);
  if (counts.length > 0) {
    const max = Math.max(...counts);
    if (max >= 1000) return "large";
    if (max >= 150) return "medium";
    return "small";
  }
  return null;
}

const ATTENTION_RE =
  /\b(no|not|none|never|missing|absent|lack|lacking|without|unknown|fragile|risk|risks|risky|manual|insecure|vulnerab\w*|broken|fail|fails|failing|blocked|critical|danger\w*)\b/i;
const WARNING_RE =
  /\b(planned|partial|partially|some|minimal|wip|in[-\s]progress|staging[-\s]only|single[-\s]region|deprecat\w*|limited|todo|tbd|soon|pending|beta|experimental)\b/i;
const OK_RE =
  /\b(enforced|automated|enabled|configured|complete|completed|passing|structured|isolated|multi[-\s]tenant|secure|active|healthy|ready|yes|robust)\b/i;

/**
 * Classify a finding's severity from its text. Underscores are treated as
 * spaces so fragility flags like "manual_migrate_risk" classify correctly.
 * Order: attention (risk signals) > warning (caution) > ok (positive) > info.
 */
export function classifyFindingSeverity(text: string): FindingSeverity {
  const t = (text ?? "").toLowerCase().replace(/_/g, " ");
  if (!t.trim()) return "info";
  if (ATTENTION_RE.test(t)) return "attention";
  if (WARNING_RE.test(t)) return "warning";
  if (OK_RE.test(t)) return "ok";
  return "info";
}

/**
 * Convert plain finding bullet strings (e.g. "Auth: session cookies") into
 * structured items. A leading short "Area:" prefix becomes the area; the
 * remainder is the (verbatim) finding text. Anything that does not fit safely
 * falls back to an "uncategorized" area with "info" severity, keeping the full
 * text. Never drops or alters the underlying content.
 */
export function parseStructuredFindings(findings: readonly string[]): StructuredFinding[] {
  if (!Array.isArray(findings)) return [];
  const out: StructuredFinding[] = [];
  for (const entry of findings) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon > 0 && colon <= 32) {
      const area = trimmed.slice(0, colon).trim();
      const text = trimmed.slice(colon + 1).trim();
      // Accept only short, label-shaped areas (1–2 words) so we don't
      // mis-split prose that merely contains a colon.
      const looksLikeLabel =
        /^[A-Za-z][A-Za-z0-9 /&+.-]*$/.test(area) && area.split(/\s+/).length <= 2;
      if (area && text && looksLikeLabel) {
        out.push({ area, text, severity: classifyFindingSeverity(text) });
        continue;
      }
    }
    // Fallback: uncertain parse — keep the whole line, mark uncategorized/info.
    out.push({ area: "uncategorized", text: trimmed, severity: "info" });
  }
  return out;
}

/**
 * Parse a raw Stage 3 diagnostic paste into structured display data. Pure and
 * total: on garbage input it returns empty structured collections while
 * preserving the raw text (and today's free-text/bullet renderings) so nothing
 * is ever lost.
 */
export function parseStructuredReadiness(raw: string): StructuredReadiness {
  const safeRaw = typeof raw === "string" ? raw : "";
  const report: ReadinessReportV1Partial = safeRaw ? parseReadinessPastePartial(safeRaw) : {};

  const stackText = describeStack(report);
  const stack = parseStackEntries(stackSourceFromReport(report, safeRaw));

  const sizeText = typeof report.size === "string" ? report.size : "";
  const metrics = parseSizeMetrics(sizeText);
  const size: StructuredSize = {
    text: describeSize(report),
    metrics,
    classification: classifyReadinessSize(sizeText, metrics),
  };

  const findingsText = buildConfirmationFindings(report, 12);
  const findings = parseStructuredFindings(findingsText);

  return { raw: safeRaw, stack, stackText, size, findings, findingsText };
}
