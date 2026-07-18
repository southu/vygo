/**
 * Evidence-backed insights layer.
 *
 * Extracts concrete, quotable artifacts from a prospect's submission answers
 * (named tools/platforms, integration counts, security practices, team size,
 * free-text maturity signals) and ranks them as second-person insight objects
 * for the results payload. Pure data/logic — no UI.
 */

/** Insight classification for ranked results. */
export type InsightType = "strength" | "risk" | "opportunity";

/**
 * Mission-shaped insight object returned on scored results:
 * { type, headline, detail, source_answer, dimension }
 */
export type EvidenceInsight = {
  type: InsightType;
  headline: string;
  detail: string;
  source_answer: string;
  dimension: string;
};

/** Canonical catalog of tools/platforms we detect by name (case-insensitive). */
const KNOWN_TOOLS: readonly string[] = [
  "Zapier",
  "Make",
  "LangChain",
  "LlamaIndex",
  "CrewAI",
  "AutoGPT",
  "n8n",
  "Slack",
  "Salesforce",
  "HubSpot",
  "Stripe",
  "Auth0",
  "Clerk",
  "Okta",
  "Vercel",
  "Railway",
  "Heroku",
  "Netlify",
  "AWS",
  "Azure",
  "GCP",
  "Google Cloud",
  "Supabase",
  "Firebase",
  "PlanetScale",
  "Postgres",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "MySQL",
  "Docker",
  "Kubernetes",
  "OpenAI",
  "Anthropic",
  "Pinecone",
  "Weaviate",
  "Datadog",
  "Sentry",
  "Segment",
  "Intercom",
  "GitHub Actions",
  "GitLab CI",
  "CircleCI",
  "Next.js",
  "React",
  "Vue",
  "Svelte",
  "Fastify",
  "Express",
  "Django",
  "Rails",
  "Flask",
  "NestJS",
  "TypeScript",
  "Python",
  "Node.js",
  "Go",
  "Rust",
  "Java",
  "Prisma",
  "Hasura",
  "GraphQL",
  "Resend",
  "SendGrid",
  "Twilio",
  "Cloudflare",
  "Terraform",
  "Pulumi",
  "Vault",
  "1Password",
  "LangSmith",
  "Haystack",
  "Semantic Kernel",
];

/** Sort known tools longest-first so "GitHub Actions" wins over partial matches. */
const KNOWN_TOOLS_SORTED = [...KNOWN_TOOLS].sort((a, b) => b.length - a.length);

/** Fields that commonly name tools / platforms. */
const TOOL_FIELDS = [
  "integrations",
  "frontend",
  "backend",
  "database",
  "languages",
  "deploys",
  "auth",
  "summary",
  "background_jobs",
] as const;

/** Map report fields → scoring dimension labels. */
const FIELD_DIMENSION: Record<string, string> = {
  auth: "Security",
  authorization: "Security",
  row_level_security: "Security",
  secrets_pattern: "Security",
  api_surface: "Security",
  tests: "Reliability",
  error_handling: "Reliability",
  background_jobs: "Reliability",
  fragility_flags: "Reliability",
  logging: "Reliability",
  deploys: "Operability",
  environments: "Operability",
  structure: "Maintainability",
  languages: "Maintainability",
  size: "Maintainability",
  frontend: "Maintainability",
  backend: "Maintainability",
  database: "Maintainability",
  integrations: "Operability",
  pii_categories: "Compliance posture",
  tenancy: "Compliance posture",
  summary: "Maintainability",
};

type DraftInsight = EvidenceInsight & {
  /** Higher = earlier in ranked list. Deterministic secondary keys for stability. */
  rank: number;
};

function isUnknownish(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  const s = String(value).trim();
  if (!s) return true;
  return /^(unknown|n\/a|na|not sure|not yet determined|tbd|—|-)$/i.test(s);
}

/** Max length for insight source quotes / free-text surfaces (bounded display). */
export const INSIGHT_SOURCE_MAX_CHARS = 280;
/** Max length for insight detail / headline free-text surfaces. */
export const INSIGHT_DETAIL_MAX_CHARS = 480;
export const INSIGHT_HEADLINE_MAX_CHARS = 160;

/**
 * Truncate by Unicode code points (not UTF-16 code units) so surrogate pairs
 * (emoji / non-BMP) are never split mid-character. Unpaired surrogates break
 * JSON→Postgres UTF-8 encoding and can 500 the score path.
 *
 * `max` is a code-point budget. When truncated, the final code point is an
 * ellipsis (…), so at most `max - 1` source code points are kept.
 */
export function clipByCodePoints(value: string, max: number): string {
  if (max <= 0) return "";
  if (!value) return value;
  // Array.from iterates code points; String.prototype.slice uses UTF-16 units.
  const points = Array.from(value);
  if (points.length <= max) return value;
  if (max === 1) return "…";
  return `${points.slice(0, max - 1).join("")}…`;
}

/**
 * Collapse whitespace and truncate with a clean ellipsis for UI surfaces.
 * Never returns pure whitespace. Safe for dense emoji / non-BMP input.
 */
export function clipDisplayText(value: string, max = INSIGHT_SOURCE_MAX_CHARS): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return clipByCodePoints(t, max);
}

/** Preserve original wording of a submitted answer as source_answer. */
export function rawAnswerText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : String(v)))
      .filter(Boolean)
      .join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldDimension(field: string): string {
  return FIELD_DIMENSION[field] ?? "Maintainability";
}

/**
 * Detect known tools/platforms mentioned in free text.
 * Returns canonical names in the order they appear in the answer.
 */
export function extractNamedTools(text: string): string[] {
  if (!text || !text.trim()) return [];
  const lower = text.toLowerCase();
  const hits: { name: string; index: number }[] = [];
  const usedRanges: Array<[number, number]> = [];

  for (const tool of KNOWN_TOOLS_SORTED) {
    const needle = tool.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      // Prefer word-ish boundaries so "Go" does not match "going".
      const before = idx === 0 ? " " : lower[idx - 1]!;
      const after = end >= lower.length ? " " : lower[end]!;
      const boundaryOk = !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after);
      if (boundaryOk) {
        const overlaps = usedRanges.some(([a, b]) => !(end <= a || idx >= b));
        if (!overlaps) {
          hits.push({ name: tool, index: idx });
          usedRanges.push([idx, end]);
        }
      }
      from = idx + 1;
    }
  }

  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const h of hits) {
    const key = h.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(h.name);
  }
  return ordered;
}

/** Pull the first numeric integration/tool count from free text. */
export function extractIntegrationCount(text: string): number | null {
  if (!text) return null;
  const patterns = [
    /(\d+)\s+(?:agentic\s+)?(?:integrations?|tools?|platforms?|connectors?|workflows?)/i,
    /(?:integrations?|tools?|platforms?|connectors?)\s*[:=]?\s*(\d+)/i,
    /(\d+)\s+total\s+(?:integrations?|tools?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 10_000) return n;
    }
  }
  return null;
}

/** Team size / maturity phrases worth echoing (verbatim fragment when possible). */
export function extractTeamSignals(text: string): string | null {
  if (!text || isUnknownish(text)) return null;
  const patterns = [
    /team of \d+/i,
    /small team(?: of \d+)?/i,
    /solo(?:\s*\/\s*MVP)?/i,
    /many services or modules/i,
    /medium\s*\([^)]*team[^)]*\)/i,
    /large\s*\([^)]*\)/i,
    /small\s*\([^)]*\)/i,
    /\b\d+\s+(?:engineers?|devs?|developers?|people)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[0]) return m[0];
  }
  // Fall back to the whole size answer when it carries non-generic substance.
  const t = text.trim();
  if (t.length >= 4 && !/^unknown$/i.test(t)) return t;
  return null;
}

function hasRiskLanguage(text: string): boolean {
  return /\b(no |none|not |without|lacking|missing|unmanaged|hardcoded|shared password|plain text|committed|manual ssh|fire and forget|prod only|console only|unhandled|spaghetti|god module)\b/i.test(
    text,
  );
}

function hasStrengthLanguage(text: string): boolean {
  return /\b(vault|secret manager|mfa|sso|saml|oauth|oidc|rbac|rls|ci\/cd|github actions|automated|pipeline|unit|integration|e2e|rollback|structured|request id|staging|enforced|rotated|least privilege)\b/i.test(
    text,
  );
}

function dedupeKey(insight: Pick<EvidenceInsight, "headline" | "source_answer">): string {
  return `${insight.headline.trim().toLowerCase()}||${insight.source_answer.trim().toLowerCase()}`;
}

function pushDraft(out: DraftInsight[], draft: DraftInsight): void {
  const headline = clipDisplayText(draft.headline ?? "", INSIGHT_HEADLINE_MAX_CHARS);
  const detail = clipDisplayText(draft.detail ?? "", INSIGHT_DETAIL_MAX_CHARS);
  const source_answer = clipDisplayText(draft.source_answer ?? "", INSIGHT_SOURCE_MAX_CHARS);
  const dimension = (draft.dimension ?? "").trim();
  // Sparse / empty answers: never emit blank quotes or fabricated filler cards.
  if (!headline || !detail || !source_answer || !dimension) {
    return;
  }
  if (!/you|your/i.test(`${headline} ${detail}`)) {
    // Mission requires second person; fail closed rather than emit generic copy.
    return;
  }
  const normalized: DraftInsight = {
    ...draft,
    headline,
    detail,
    source_answer,
    dimension,
  };
  const key = dedupeKey(normalized);
  if (out.some((d) => dedupeKey(d) === key)) return;
  out.push(normalized);
}

function quoteList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Build a ranked, deterministic list of evidence insights from a submission
 * report. Dimension details may be passed for future score-aware ranking; the
 * current extractor is answer-grounded only.
 */
export function buildEvidenceInsights(
  report: Record<string, unknown>,
  _dimensionDetails?: unknown,
): EvidenceInsight[] {
  const drafts: DraftInsight[] = [];
  const rec = report ?? {};

  // --- Tools / platforms + integration counts --------------------------------
  const integrationRaw = rawAnswerText(rec.integrations);
  const summaryRaw = rawAnswerText(rec.summary);
  const toolCorpus = TOOL_FIELDS.map((f) => rawAnswerText(rec[f]))
    .filter(Boolean)
    .join(" | ");
  const toolsFromIntegrations = extractNamedTools(integrationRaw);
  const toolsAll = extractNamedTools(toolCorpus);
  // Prefer tools named in integrations for the primary tooling insight.
  const primaryTools =
    toolsFromIntegrations.length >= 1 ? toolsFromIntegrations : toolsAll.slice(0, 6);
  const countFromText =
    extractIntegrationCount(integrationRaw) ??
    extractIntegrationCount(summaryRaw) ??
    extractIntegrationCount(toolCorpus);
  const toolCount = countFromText ?? (primaryTools.length >= 2 ? primaryTools.length : null);

  if (primaryTools.length >= 1 && integrationRaw && !isUnknownish(integrationRaw)) {
    const listed = quoteList(primaryTools.slice(0, 5));
    if (toolCount != null && toolCount > 0) {
      pushDraft(drafts, {
        type: "opportunity",
        headline: `You run ${toolCount} integration${toolCount === 1 ? "" : "s"} spanning ${listed}`,
        detail: `Your integrations answer names ${listed}${toolCount > primaryTools.length ? ` among ${toolCount} total connections` : ""}, which is a concrete surface area to harden and observe.`,
        source_answer: integrationRaw,
        dimension: "Operability",
        rank: 70 + Math.min(toolCount, 20),
      });
    } else {
      pushDraft(drafts, {
        type: "opportunity",
        headline: `You named ${listed} in your stack`,
        detail: `Your submission lists ${listed} as integration or platform surface — worth treating as first-class production dependencies.`,
        source_answer: integrationRaw,
        dimension: "Operability",
        rank: 65,
      });
    }

    // One insight per named tool (up to 3) so multi-tool submissions stay specific.
    for (let i = 0; i < Math.min(primaryTools.length, 3); i++) {
      const tool = primaryTools[i]!;
      pushDraft(drafts, {
        type: "strength",
        headline: `You already operate with ${tool}`,
        detail: `Your answer references ${tool} specifically ("${clipDisplayText(integrationRaw, 160)}"), which is a concrete platform signal we can score against.`,
        source_answer: integrationRaw.includes(tool)
          ? integrationRaw
          : rawAnswerText(
              TOOL_FIELDS.map((f) => rec[f]).find((v) =>
                rawAnswerText(v).toLowerCase().includes(tool.toLowerCase()),
              ) ?? integrationRaw,
            ),
        dimension: fieldDimension(
          TOOL_FIELDS.find((f) =>
            rawAnswerText(rec[f]).toLowerCase().includes(tool.toLowerCase()),
          ) ?? "integrations",
        ),
        rank: 40 - i,
      });
    }
  } else if (primaryTools.length >= 2) {
    // Tools spread across stack fields without a clear integrations answer.
    const listed = quoteList(primaryTools.slice(0, 4));
    const source =
      rawAnswerText(rec.frontend) ||
      rawAnswerText(rec.backend) ||
      rawAnswerText(rec.languages) ||
      listed;
    pushDraft(drafts, {
      type: "strength",
      headline: `You ship on ${listed}`,
      detail: `Your stack answers name ${listed}, giving a concrete platform baseline rather than a generic "unknown" stack.`,
      source_answer: source,
      dimension: "Maintainability",
      rank: 42,
    });
  }

  // Combined tools + security gap (mission example shape).
  const secretsRaw = rawAnswerText(rec.secrets_pattern);
  const secretsRisk =
    secretsRaw &&
    !isUnknownish(secretsRaw) &&
    (hasRiskLanguage(secretsRaw) ||
      /\b(no centralized|not centralized|env files?|in the repo|in git|plaintext|plain text)\b/i.test(
        secretsRaw,
      ));

  if (secretsRisk && (toolCount != null || primaryTools.length >= 2)) {
    const n = toolCount ?? primaryTools.length;
    const named = primaryTools.length >= 1 ? quoteList(primaryTools.slice(0, 3)) : null;
    const toolPhrase = named ?? `${n} integration${n === 1 ? "" : "s"}`;
    // Prefer quoting named platforms + the count so headlines stay submission-specific.
    const headline =
      named != null
        ? `You run ${named}${n > primaryTools.length || countFromText != null ? ` (${n} integrations)` : ""} without centralized credential management`
        : `You run ${n} agentic tool${n === 1 ? "" : "s"} without centralized credential management`;
    pushDraft(drafts, {
      type: "risk",
      headline,
      detail: `You reported secrets as "${secretsRaw}" while operating ${toolPhrase}. That combination is a high-priority credential risk on a multi-tool surface.`,
      source_answer: secretsRaw,
      dimension: "Security",
      rank: 100,
    });
  } else if (secretsRisk) {
    pushDraft(drafts, {
      type: "risk",
      headline: `You reported gaps in secrets handling`,
      detail: `Your secrets answer — "${secretsRaw}" — admits a credential management gap that production audits treat as a blocker.`,
      source_answer: secretsRaw,
      dimension: "Security",
      rank: 98,
    });
  } else if (secretsRaw && !isUnknownish(secretsRaw) && hasStrengthLanguage(secretsRaw)) {
    pushDraft(drafts, {
      type: "strength",
      headline: `You manage secrets with a deliberate pattern`,
      detail: `You reported secrets as "${secretsRaw}", which is a positive control signal for production readiness.`,
      source_answer: secretsRaw,
      dimension: "Security",
      rank: 55,
    });
  }

  // --- Auth / authorization strengths & risks --------------------------------
  for (const field of ["auth", "authorization", "row_level_security", "api_surface"] as const) {
    const raw = rawAnswerText(rec[field]);
    if (!raw || isUnknownish(raw)) continue;
    const dim = fieldDimension(field);
    if (hasRiskLanguage(raw) && !hasStrengthLanguage(raw)) {
      pushDraft(drafts, {
        type: "risk",
        headline: `You flagged weak ${field.replace(/_/g, " ")}`,
        detail: `You answered "${raw}", which is an admitted gap on the ${dim} dimension.`,
        source_answer: raw,
        dimension: dim,
        rank: 90,
      });
    } else if (hasStrengthLanguage(raw) || extractNamedTools(raw).length > 0) {
      const tools = extractNamedTools(raw);
      const focus = tools[0] ? tools[0] : clipDisplayText(raw, 80);
      pushDraft(drafts, {
        type: "strength",
        headline: `Your ${field.replace(/_/g, " ")} practice is production-leaning`,
        detail: `You reported "${raw}"${tools[0] ? ` (including ${focus})` : ""}, a concrete ${dim.toLowerCase()} control.`,
        source_answer: raw,
        dimension: dim,
        rank: 48,
      });
    }
  }

  // --- Tests -----------------------------------------------------------------
  const testsRaw = rawAnswerText(rec.tests);
  if (testsRaw && !isUnknownish(testsRaw)) {
    if (
      hasRiskLanguage(testsRaw) ||
      /\b(no automated|none|never run|not run|ad-hoc)\b/i.test(testsRaw)
    ) {
      pushDraft(drafts, {
        type: "risk",
        headline: `You lack durable automated test coverage`,
        detail: `You reported tests as "${testsRaw}", which undercuts reliability confidence before launch.`,
        source_answer: testsRaw,
        dimension: "Reliability",
        rank: 88,
      });
    } else if (hasStrengthLanguage(testsRaw) || /\b(unit|integration|e2e|ci)\b/i.test(testsRaw)) {
      pushDraft(drafts, {
        type: "strength",
        headline: `You already gate quality with automated tests`,
        detail: `You reported tests as "${testsRaw}", a reliability strength worth preserving in production.`,
        source_answer: testsRaw,
        dimension: "Reliability",
        rank: 52,
      });
    } else {
      pushDraft(drafts, {
        type: "opportunity",
        headline: `Your test posture is only partially evidenced`,
        detail: `You answered "${testsRaw}" — enough to score, but not yet a clear production gate.`,
        source_answer: testsRaw,
        dimension: "Reliability",
        rank: 60,
      });
    }
  }

  // --- Deploys / environments ------------------------------------------------
  const deploysRaw = rawAnswerText(rec.deploys);
  if (deploysRaw && !isUnknownish(deploysRaw)) {
    if (hasRiskLanguage(deploysRaw) || /\b(manual|ssh|someone clicks)\b/i.test(deploysRaw)) {
      pushDraft(drafts, {
        type: "risk",
        headline: `Your deploy path is still manual`,
        detail: `You reported deploys as "${deploysRaw}", which is an operability risk as traffic grows.`,
        source_answer: deploysRaw,
        dimension: "Operability",
        rank: 86,
      });
    } else if (hasStrengthLanguage(deploysRaw)) {
      pushDraft(drafts, {
        type: "strength",
        headline: `You deploy through an automated pipeline`,
        detail: `You reported deploys as "${deploysRaw}", a strong operability signal.`,
        source_answer: deploysRaw,
        dimension: "Operability",
        rank: 50,
      });
    }
  }

  const envRaw = rawAnswerText(rec.environments);
  if (envRaw && !isUnknownish(envRaw)) {
    if (/\bprod only|single|localhost only\b/i.test(envRaw) || hasRiskLanguage(envRaw)) {
      pushDraft(drafts, {
        type: "risk",
        headline: `Your environment split is thin`,
        detail: `You reported environments as "${envRaw}", leaving little room to stage risk before production.`,
        source_answer: envRaw,
        dimension: "Operability",
        rank: 84,
      });
    } else if (/\bstaging\b/i.test(envRaw) || hasStrengthLanguage(envRaw)) {
      pushDraft(drafts, {
        type: "strength",
        headline: `You separate environments before production`,
        detail: `You reported environments as "${envRaw}", which supports safer change management.`,
        source_answer: envRaw,
        dimension: "Operability",
        rank: 46,
      });
    }
  }

  // --- Team size / maturity --------------------------------------------------
  const sizeRaw = rawAnswerText(rec.size);
  const teamSignal = extractTeamSignals(sizeRaw);
  if (teamSignal) {
    pushDraft(drafts, {
      type: "opportunity",
      headline: `Your team signal is "${teamSignal}"`,
      detail: `You described codebase size / team as "${sizeRaw}". That maturity signal shapes how much process and platform leverage you can absorb.`,
      source_answer: sizeRaw,
      dimension: "Maintainability",
      rank: 62,
    });
  }

  // --- Structure / stack free-text -------------------------------------------
  const structureRaw = rawAnswerText(rec.structure);
  if (structureRaw && !isUnknownish(structureRaw)) {
    if (hasRiskLanguage(structureRaw)) {
      pushDraft(drafts, {
        type: "risk",
        headline: `You described structural risk in the codebase`,
        detail: `You reported structure as "${structureRaw}", which is a maintainability concern to address before scaling the team.`,
        source_answer: structureRaw,
        dimension: "Maintainability",
        rank: 82,
      });
    } else if (
      hasStrengthLanguage(structureRaw) ||
      /\b(modular|monorepo|packages|services)\b/i.test(structureRaw)
    ) {
      pushDraft(drafts, {
        type: "strength",
        headline: `Your codebase structure is intentionally modular`,
        detail: `You reported structure as "${structureRaw}", a maintainability strength.`,
        source_answer: structureRaw,
        dimension: "Maintainability",
        rank: 44,
      });
    }
  }

  // --- PII / compliance ------------------------------------------------------
  const piiRaw = rawAnswerText(rec.pii_categories);
  if (piiRaw && !isUnknownish(piiRaw)) {
    if (/\b(payment|card|pci|hipaa|phi|health|medical|ssn)\b/i.test(piiRaw)) {
      pushDraft(drafts, {
        type: "risk",
        headline: `You handle sensitive data categories in production scope`,
        detail: `You reported PII categories as "${piiRaw}", which raises the compliance bar for access control and auditability.`,
        source_answer: piiRaw,
        dimension: "Compliance posture",
        rank: 92,
      });
    } else if (/\b(none|no payment|no health|minimized|email,\s*name)\b/i.test(piiRaw)) {
      pushDraft(drafts, {
        type: "strength",
        headline: `You keep sensitive data scope limited`,
        detail: `You reported PII categories as "${piiRaw}", a favorable compliance posture signal.`,
        source_answer: piiRaw,
        dimension: "Compliance posture",
        rank: 43,
      });
    }
  }

  // --- Fragility flags -------------------------------------------------------
  const fragilityRaw = rawAnswerText(rec.fragility_flags);
  if (fragilityRaw && !isUnknownish(fragilityRaw) && !/^none$/i.test(fragilityRaw)) {
    pushDraft(drafts, {
      type: "risk",
      headline: `You called out fragility in your own words`,
      detail: `You listed fragility flags as "${fragilityRaw}", which we treat as explicit self-reported production risk.`,
      source_answer: fragilityRaw,
      dimension: "Reliability",
      rank: 87,
    });
  }

  // --- Logging / error handling ----------------------------------------------
  for (const field of ["logging", "error_handling", "background_jobs"] as const) {
    const raw = rawAnswerText(rec[field]);
    if (!raw || isUnknownish(raw)) continue;
    const dim = fieldDimension(field);
    const label = field.replace(/_/g, " ");
    if (hasRiskLanguage(raw)) {
      pushDraft(drafts, {
        type: "risk",
        headline: `Your ${label} answer admits a production gap`,
        detail: `You reported ${label} as "${raw}".`,
        source_answer: raw,
        dimension: dim,
        rank: 80,
      });
    } else if (hasStrengthLanguage(raw)) {
      pushDraft(drafts, {
        type: "strength",
        headline: `Your ${label} practice is evidence-backed`,
        detail: `You reported ${label} as "${raw}".`,
        source_answer: raw,
        dimension: dim,
        rank: 41,
      });
    }
  }

  // --- Free-text summary opportunity ----------------------------------------
  if (summaryRaw && !isUnknownish(summaryRaw) && summaryRaw.length >= 12) {
    const summaryTools = extractNamedTools(summaryRaw);
    if (summaryTools.length >= 1) {
      pushDraft(drafts, {
        type: "opportunity",
        headline: `Your product summary names ${quoteList(summaryTools.slice(0, 3))}`,
        detail: `You described the product as "${clipDisplayText(summaryRaw, 200)}", grounding the engagement in your own wording.`,
        source_answer: summaryRaw,
        dimension: "Maintainability",
        rank: 58,
      });
    } else {
      pushDraft(drafts, {
        type: "opportunity",
        headline: `Your own product description sets the scope`,
        detail: `You wrote "${clipDisplayText(summaryRaw, 200)}", which we echo back so findings stay tied to what you actually build.`,
        source_answer: summaryRaw,
        dimension: "Maintainability",
        rank: 35,
      });
    }
  }

  // Stable ranking: rank desc, then type order, then dimension, then headline.
  const typeOrder: Record<InsightType, number> = {
    risk: 0,
    opportunity: 1,
    strength: 2,
  };
  drafts.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    const dim = a.dimension.localeCompare(b.dimension);
    if (dim !== 0) return dim;
    return a.headline.localeCompare(b.headline);
  });

  // Final pass: bounded strings only (defense in depth for long free-text).
  return drafts
    .map(({ type, headline, detail, source_answer, dimension }) => ({
      type,
      headline: clipDisplayText(headline, INSIGHT_HEADLINE_MAX_CHARS),
      detail: clipDisplayText(detail, INSIGHT_DETAIL_MAX_CHARS),
      source_answer: clipDisplayText(source_answer, INSIGHT_SOURCE_MAX_CHARS),
      dimension: dimension.trim(),
    }))
    .filter(
      (i) =>
        Boolean(i.headline) &&
        Boolean(i.detail) &&
        Boolean(i.source_answer) &&
        Boolean(i.dimension),
    );
}
