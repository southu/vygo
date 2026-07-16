/**
 * Edge-portable Stage 3 parse + Stage 4 follow-ups.
 * Mirrors packages/validation logic so www.vygo.ai works even when the Railway
 * Fastify service is behind on routes. Never logs or returns raw secrets.
 */

export const REPORT_START = "=== VYGO-READINESS-REPORT v1 ===";
export const REPORT_END = "=== END VYGO-READINESS-REPORT ===";

export const REPORT_FIELDS = [
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

export const BUDGET_BUCKET_OPTIONS = [
  "<$25K",
  "$25–75K",
  "$75–150K",
  "$150K+",
  "no idea yet",
] as const;

export type FollowupQuestion = {
  questionKey: string;
  prompt: string;
  category: string;
  sortOrder: number;
  type: string;
  options?: string[];
  helper?: string;
  required: boolean;
  trigger: string;
};

/** Canonical Stage 4 seed (same as packages/validation + migration 0006). */
export const FOLLOWUP_SEED: Array<{
  questionKey: string;
  prompt: string;
  category: string;
  sortOrder: number;
  type: string;
  trigger: string;
  options?: readonly string[];
  helper?: string;
}> = [
  {
    questionKey: "users_today",
    prompt: "How many users do you have today?",
    category: "followup",
    sortOrder: 200,
    type: "range",
    trigger: "always",
    options: ["0–10", "11–100", "101–1,000", "1,001–10,000", "10,000+", "not sure"],
    helper: "Pick the closest range.",
  },
  {
    questionKey: "users_12_months",
    prompt: "How many users do you expect in 12 months?",
    category: "followup",
    sortOrder: 210,
    type: "range",
    trigger: "always",
    options: ["0–10", "11–100", "101–1,000", "1,001–10,000", "10,000+", "not sure"],
    helper: "Pick the closest range.",
  },
  {
    questionKey: "done_looks_like",
    prompt: "What does “done” look like for this engagement?",
    category: "followup",
    sortOrder: 220,
    type: "text",
    trigger: "always",
    helper: "One or two short sentences.",
  },
  {
    questionKey: "budget",
    prompt: "What budget range are you considering?",
    category: "followup",
    sortOrder: 230,
    type: "single",
    trigger: "always",
    options: BUDGET_BUCKET_OPTIONS,
  },
  {
    questionKey: "security_framework",
    prompt: "Which security / compliance questionnaire framework do you need to pass?",
    category: "followup_conditional",
    sortOrder: 300,
    type: "multi",
    trigger: "security_questionnaire",
    options: ["SOC 2", "ISO 27001", "HIPAA", "PCI DSS", "FedRAMP", "Other / not sure"],
  },
  {
    questionKey: "tests_on_every_deploy",
    prompt: "Do automated tests run on every deploy today?",
    category: "followup_conditional",
    sortOrder: 310,
    type: "single",
    trigger: "tests_on_deploy",
    options: ["Yes, required in CI", "Sometimes", "No", "Not sure"],
  },
  {
    questionKey: "payment_health_pii_prod",
    prompt: "Do you process payment data or health PII in production?",
    category: "followup_conditional",
    sortOrder: 320,
    type: "single",
    trigger: "payment_health_pii",
    options: ["Payment data", "Health PII", "Both", "Neither", "Not sure"],
  },
  {
    questionKey: "sso_saml",
    prompt: "Do enterprise customers require SSO / SAML?",
    category: "followup_conditional",
    sortOrder: 330,
    type: "single",
    trigger: "sso_saml",
    options: ["Required now", "Required soon", "Nice to have", "No", "Not sure"],
  },
  {
    questionKey: "who_deploys",
    prompt: "Who deploys to production today?",
    category: "followup_conditional",
    sortOrder: 340,
    type: "single",
    trigger: "who_deploys",
    options: [
      "Automated CI/CD only",
      "Engineer clicks one-click deploy",
      "Manual / SSH / console",
      "Agency / contractor",
      "Not sure",
    ],
  },
  {
    questionKey: "repo_access_audit",
    prompt: "Can Vygo get temporary read-only repo access for the audit?",
    category: "followup_conditional",
    sortOrder: 350,
    type: "single",
    trigger: "repo_access",
    options: ["Yes", "Maybe — need approval", "No", "Not sure"],
  },
];

const SECRET_RES: RegExp[] = [
  /\bsk[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bpostgres(?:ql)?:\/\/[^/\s"'`]+:[^@\s"'`]+@[^\s"'`]*/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}['"]?/gi,
  /\bBearer\s+[A-Za-z0-9._\-+=/]+/gi,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]+/g,
];

export function edgeRedactSecrets(raw: string): {
  redacted: string;
  didRedact: boolean;
  hitCount: number;
} {
  if (!raw) return { redacted: raw, didRedact: false, hitCount: 0 };
  let out = raw;
  let hitCount = 0;
  for (const re of SECRET_RES) {
    out = out.replace(re, (match) => {
      hitCount += 1;
      const assign = match.match(
        /^((?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client_secret)\s*[:=]\s*)/i,
      );
      if (assign?.[1]) return `${assign[1]}[REDACTED]`;
      if (/^Bearer\s+/i.test(match)) return "Bearer [REDACTED]";
      if (/^postgres/i.test(match)) return match.replace(/\/\/[^/\s"'`]+/, "//[REDACTED]");
      return "[REDACTED]";
    });
  }
  return { redacted: out, didRedact: out !== raw || hitCount > 0, hitCount };
}

function stripFences(text: string): string {
  let out = text.replace(/\r\n/g, "\n");
  const full = out.match(/^```(?:[\w.-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (full?.[1] != null) return full[1].trim();
  out = out.replace(/^```(?:[\w.-]+)?\s*$/gm, "");
  return out.trim();
}

function ensureFooter(text: string): string {
  if (text.includes(REPORT_START) && !text.includes(REPORT_END)) {
    return `${text.trimEnd()}\n${REPORT_END}`;
  }
  return text;
}

function normalize(raw: string): string {
  return ensureFooter(stripFences(raw)).trim();
}

function parseFields(body: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const known = new Set<string>(REPORT_FIELDS);
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
      fields[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : rawValue;
    } else if (key === "fragility_flags") {
      if (rawValue.startsWith("[")) {
        try {
          fields[key] = JSON.parse(rawValue);
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
  return fields;
}

function isFullReport(fields: Record<string, unknown>): boolean {
  for (const key of REPORT_FIELDS) {
    if (fields[key] === undefined || fields[key] === "") return false;
  }
  return typeof fields.confidence === "number";
}

function fillUnknown(partial: Record<string, unknown>): Record<string, unknown> {
  const out = { ...partial };
  for (const key of REPORT_FIELDS) {
    if (key === "confidence") {
      if (typeof out.confidence !== "number") out.confidence = 0;
      continue;
    }
    if (out[key] == null || out[key] === "") out[key] = "UNKNOWN";
  }
  return out;
}

function recoverSloppy(raw: string): Record<string, unknown> {
  const text = raw.replace(/\r\n/g, "\n");
  const fields: Record<string, unknown> = {};
  const grab = (re: RegExp) => text.match(re)?.[1]?.trim();
  const summary = grab(/summary\s*[-:]\s*(.+)/i);
  if (summary) fields.summary = summary.slice(0, 500);
  if (/typescript/i.test(text)) fields.languages = "TypeScript";
  if (/python/i.test(text)) {
    fields.languages = fields.languages ? `${fields.languages}, Python` : "Python";
  }
  if (/next\.?js|nextjs/i.test(text)) fields.frontend = "Next.js";
  if (/\bnode\b|fastify|express/i.test(text)) fields.backend = "Node";
  if (/postgres/i.test(text)) fields.database = "Postgres";
  if (/clerk|auth0|magic link|session/i.test(text)) {
    fields.auth =
      grab(/auth(?:\s*stuff)?\s*:\s*(.+)/i) || (/clerk/i.test(text) ? "Clerk" : "session");
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
  if (/confidence\s+low|low confidence/i.test(text)) fields.confidence = 0.25;
  return fields;
}

function findings(report: Record<string, unknown>): string[] {
  const order: [string, string][] = [
    ["Auth", "auth"],
    ["Database", "database"],
    ["Deploy", "deploys"],
    ["Tests", "tests"],
    ["Tenancy", "tenancy"],
    ["Secrets", "secrets_pattern"],
    ["Frontend", "frontend"],
    ["Backend", "backend"],
  ];
  const out: string[] = [];
  for (const [label, key] of order) {
    const v = report[key];
    if (typeof v === "string" && v.trim() && v.toUpperCase() !== "UNKNOWN") {
      out.push(`${label}: ${v.trim()}`);
    }
    if (out.length >= 6) break;
  }
  return out;
}

function stackOf(report: Record<string, unknown>): string {
  const parts = [report.languages, report.frontend, report.backend]
    .filter(
      (p): p is string =>
        typeof p === "string" && p.trim().length > 0 && p.toUpperCase() !== "UNKNOWN",
    )
    .map((p) => p.trim());
  return parts.length > 0 ? [...new Set(parts)].join(" · ") : "Not yet determined";
}

function sizeOf(report: Record<string, unknown>): string {
  const size = typeof report.size === "string" ? report.size.trim() : "";
  return size && size.toUpperCase() !== "UNKNOWN" ? size : "Not yet determined";
}

export type EdgeParseResult = {
  parseStatus: "ok" | "partial" | "pending" | "manual";
  routeToManual: boolean;
  report: Record<string, unknown>;
  stack: string;
  size: string;
  findings: string[];
  redacted: string;
  didRedact: boolean;
  hitCount: number;
};

/** Full Stage 3 edge parse: redact → normalize → deterministic schema parse. */
export function edgeParsePaste(paste: string): EdgeParseResult {
  const { redacted, didRedact, hitCount } = edgeRedactSecrets(paste);
  const safe = redacted.slice(0, 50_000);
  const normalized = normalize(safe);

  let body = normalized;
  const startIdx = body.indexOf(REPORT_START);
  if (startIdx >= 0) {
    body = body.slice(startIdx + REPORT_START.length);
    const endIdx = body.indexOf(REPORT_END);
    if (endIdx >= 0) body = body.slice(0, endIdx);
  }

  let fields = parseFields(body);
  // Also try full-document field parse if delimiters missing
  if (Object.keys(fields).length < 3) {
    fields = { ...fields, ...parseFields(normalized) };
  }
  if (Object.keys(fields).length < 3) {
    fields = { ...fields, ...recoverSloppy(safe) };
  }

  const keyCount = Object.keys(fields).filter((k) => {
    const v = fields[k];
    return v != null && v !== "" && v !== "UNKNOWN";
  }).length;

  if (isFullReport(fields)) {
    return {
      parseStatus: "ok",
      routeToManual: false,
      report: fields,
      stack: stackOf(fields),
      size: sizeOf(fields),
      findings: findings(fields),
      redacted: safe,
      didRedact,
      hitCount,
    };
  }

  if (keyCount >= 3) {
    const filled = fillUnknown(fields);
    return {
      parseStatus: "partial",
      routeToManual: false,
      report: filled,
      stack: stackOf(filled),
      size: sizeOf(filled),
      findings: findings(filled),
      redacted: safe,
      didRedact,
      hitCount,
    };
  }

  return {
    parseStatus: "manual",
    routeToManual: true,
    report: fillUnknown(fields),
    stack: "Not yet determined",
    size: "Not yet determined",
    findings: [],
    redacted: safe,
    didRedact,
    hitCount,
  };
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(String).join(" ").toLowerCase();
  return String(value).toLowerCase();
}

export function edgeEvaluateTriggers(report: Record<string, unknown>): Record<string, boolean> {
  const tests = textOf(report.tests);
  const deploys = textOf(report.deploys);
  const pii = textOf(report.pii_categories);
  const tenancy = textOf(report.tenancy);
  const auth = textOf(report.auth);
  const authorization = textOf(report.authorization);
  const fragility = textOf(report.fragility_flags);
  const conf = typeof report.confidence === "number" ? report.confidence : null;

  const multiTenantOrEnterprise =
    /multi|org|tenant|enterprise|b2b|workspace/.test(tenancy) ||
    /saml|sso|enterprise/.test(`${auth} ${authorization}`);
  const mentionsSecurityAsk =
    /soc\s*2|iso\s*27001|hipaa|compliance|questionnaire|audit/.test(
      `${textOf(report.summary)} ${fragility} ${pii}`,
    ) || /enterprise|b2b/.test(textOf(report.summary));
  const testsAmbiguous =
    !tests ||
    tests === "unknown" ||
    /no test|none|manual|not really|ad-?hoc|sometimes|partial/.test(tests) ||
    !/every deploy|on deploy|ci|required|gate/.test(tests);
  const hasPaymentOrHealthHint =
    /payment|card|pci|stripe|billing|health|hipaa|phi|medical|patient/.test(pii) ||
    /payment|health|hipaa|phi/.test(textOf(report.summary));
  const manualOrOneClickDeploy =
    !deploys ||
    deploys === "unknown" ||
    /manual|one-?click|click deploy|ssh|console|someone clicks|vercel dashboard|railway dashboard/.test(
      deploys,
    ) ||
    !/ci\/?cd|github actions|automated|pipeline/.test(deploys);
  const lowConfidence = conf == null || conf < 0.5;

  return {
    security_questionnaire: mentionsSecurityAsk || multiTenantOrEnterprise,
    tests_on_deploy: testsAmbiguous,
    payment_health_pii: hasPaymentOrHealthHint || /unknown/.test(pii) || !pii,
    sso_saml: multiTenantOrEnterprise,
    who_deploys: manualOrOneClickDeploy,
    repo_access: lowConfidence || manualOrOneClickDeploy,
  };
}

export function edgeSelectFollowups(report: Record<string, unknown>): FollowupQuestion[] {
  const triggers = edgeEvaluateTriggers(report);
  return FOLLOWUP_SEED.filter((q) => {
    if (q.trigger === "always") return true;
    return Boolean(triggers[q.trigger]);
  }).map((q) => ({
    questionKey: q.questionKey,
    prompt: q.prompt,
    category: q.category,
    sortOrder: q.sortOrder,
    type: q.type,
    options: q.options ? [...q.options] : undefined,
    helper: q.helper,
    required: q.trigger === "always",
    trigger: q.trigger,
  }));
}

export type EdgeDiscrepancyFlag = {
  questionKey: string;
  reason: string;
  reportField?: string;
  internal: true;
};

export function edgeDetectDiscrepancies(
  report: Record<string, unknown>,
  answers: Record<string, unknown>,
): EdgeDiscrepancyFlag[] {
  const flags: EdgeDiscrepancyFlag[] = [];
  const tests = textOf(report.tests);
  const deploys = textOf(report.deploys);
  const pii = textOf(report.pii_categories);
  const tenancy = textOf(report.tenancy);

  const testsAnswer = textOf(answers.tests_on_every_deploy);
  if (testsAnswer) {
    const reportSaysYes = /every deploy|on every|required in ci|ci gate/.test(tests);
    const answerSaysNo = /^(no|sometimes|not sure)/.test(testsAnswer);
    if (reportSaysYes && answerSaysNo) {
      flags.push({
        questionKey: "tests_on_every_deploy",
        reason: "answer_contradicts_report_tests",
        reportField: "tests",
        internal: true,
      });
    }
  }

  const who = textOf(answers.who_deploys);
  if (who) {
    const reportAutomated = /ci\/?cd|github actions|automated|pipeline/.test(deploys);
    const answerManual = /manual|one-click|ssh|console|agency|engineer clicks/.test(who);
    if (reportAutomated && answerManual) {
      flags.push({
        questionKey: "who_deploys",
        reason: "answer_contradicts_report_deploys",
        reportField: "deploys",
        internal: true,
      });
    }
  }

  const piiAnswer = textOf(answers.payment_health_pii_prod);
  if (piiAnswer) {
    const reportHasPayment = /payment|card|pci|stripe|billing/.test(pii);
    const reportHasHealth = /health|hipaa|phi|medical|patient/.test(pii);
    const reportNeither =
      /no payment|no health|none|email, name|no payment card or health/.test(pii) ||
      (!reportHasPayment && !reportHasHealth && pii.length > 0 && pii !== "unknown");
    if (reportNeither && /payment|health|both/.test(piiAnswer) && !/neither/.test(piiAnswer)) {
      flags.push({
        questionKey: "payment_health_pii_prod",
        reason: "answer_contradicts_report_pii",
        reportField: "pii_categories",
        internal: true,
      });
    }
  }

  const sso = textOf(answers.sso_saml);
  if (sso && /single|no multi|solo/.test(tenancy) && /required/.test(sso)) {
    flags.push({
      questionKey: "sso_saml",
      reason: "answer_contradicts_report_tenancy",
      reportField: "tenancy",
      internal: true,
    });
  }

  return flags;
}
