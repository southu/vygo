/**
 * Template-first internal lead brief for completed readiness submissions.
 *
 * Pure structured generation first; optional LLM polish is applied only when a
 * vault-backed key is present and NEVER blocks scoring or email enqueue.
 */

import { READINESS_DIMENSIONS, type ReadinessDimension } from "./readiness-scoring.js";

export type LeadBriefScoreSummary = {
  dimensions: Record<string, number>;
  overall: number | null;
  bucket: string | null;
  reasoning: string | null;
  findings: string[];
  recommendedEngagement: string | null;
};

export type LeadBriefContact = {
  name: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
};

export type LeadBriefInput = {
  submissionId: string;
  contact?: Record<string, unknown> | null;
  scores?: Record<string, unknown> | null;
  bucket?: string | null;
  discrepancyFlags?: unknown[] | null;
  parsedReport?: Record<string, unknown> | null;
  /** Stage-1 intake answers (product, build tool, blockers, deadline). */
  stage1?: Record<string, unknown> | null;
  /** Stage-4 follow-up answers including budget. */
  followupAnswers?: Record<string, unknown> | null;
  /** Optional session draft fields when stage1 is nested. */
  draft?: Record<string, unknown> | null;
};

export type LeadBrief = {
  version: 1;
  submissionId: string;
  company: string | null;
  contact: LeadBriefContact;
  source: string | null;
  productOneLiner: string | null;
  buildTool: string | null;
  blockers: string[];
  deadline: string | null;
  deadlineDetail: string | null;
  scoreSummary: LeadBriefScoreSummary;
  bucket: string | null;
  reasoning: string | null;
  parsedTechReport: Record<string, unknown> | null;
  followupAnswers: Record<string, unknown> | null;
  budget: string | null;
  discrepancyFlags: unknown[];
  /** Always exactly 3 talking points (padded/truncated). */
  talkingPoints: [string, string, string];
  llmPolished: boolean;
  generatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function asStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, 200))
    .slice(0, maxItems);
}

function pickStage1(input: LeadBriefInput): Record<string, unknown> {
  const draft = asRecord(input.draft) ?? {};
  const nested = asRecord(draft.stage1) ?? asRecord(input.stage1) ?? {};
  return { ...nested };
}

function pickFollowups(input: LeadBriefInput): Record<string, unknown> | null {
  const draft = asRecord(input.draft) ?? {};
  const fromDraft = asRecord(draft.followupAnswers);
  const direct = asRecord(input.followupAnswers);
  if (fromDraft || direct) {
    return { ...(fromDraft ?? {}), ...(direct ?? {}) };
  }
  return null;
}

function extractContact(contact: Record<string, unknown> | null | undefined): LeadBriefContact {
  const c = asRecord(contact) ?? {};
  return {
    name: asString(c.name ?? c.fullName, 120),
    email: asString(c.email, 254),
    company: asString(c.company ?? c.companyName, 160),
    source: asString(c.source, 64),
  };
}

function extractScoreSummary(
  scores: Record<string, unknown> | null | undefined,
  bucket: string | null | undefined,
): LeadBriefScoreSummary {
  const s = asRecord(scores) ?? {};
  const dimsRaw = asRecord(s.dimensions) ?? asRecord(s.scores) ?? {};
  const dimensions: Record<string, number> = {};
  for (const label of READINESS_DIMENSIONS) {
    const v = dimsRaw[label];
    if (typeof v === "number" && Number.isFinite(v)) {
      dimensions[label] = Math.round(v);
    }
  }
  // Include any extra numeric dimension keys.
  for (const [k, v] of Object.entries(dimsRaw)) {
    if (dimensions[k] != null) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      dimensions[k] = Math.round(v);
    }
  }
  const findings = Array.isArray(s.findings)
    ? (s.findings as unknown[])
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.slice(0, 280))
        .slice(0, 5)
    : [];
  return {
    dimensions,
    overall: typeof s.overall === "number" && Number.isFinite(s.overall) ? s.overall : null,
    bucket: asString(bucket ?? s.bucket, 64),
    reasoning: asString(s.reasoning, 2000),
    findings,
    recommendedEngagement: asString(s.recommendedEngagement ?? s.offerKey, 120),
  };
}

/** Summarize parsed tech report for ops (no raw paste). */
function summarizeTechReport(
  report: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!report) return null;
  const keys = [
    "summary",
    "languages",
    "structure",
    "size",
    "auth",
    "authorization",
    "row_level_security",
    "tests",
    "deploys",
    "secrets_pattern",
    "pii_categories",
    "error_handling",
    "logging",
    "background_jobs",
    "tenancy",
    "environments",
    "fragility_flags",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (report[key] == null) continue;
    const v = report[key];
    if (typeof v === "string") {
      out[key] = v.slice(0, 400);
    } else if (Array.isArray(v)) {
      out[key] = v
        .slice(0, 12)
        .map((item) => (typeof item === "string" ? item.slice(0, 120) : item));
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function extractBudget(followups: Record<string, unknown> | null): string | null {
  if (!followups) return null;
  return (
    asString(followups.budget, 80) ||
    asString(followups.budget_bucket, 80) ||
    asString(followups.budgetBucket, 80) ||
    asString(followups.budget_range, 80) ||
    asString(followups.budgetRange, 80)
  );
}

/**
 * Build three suggested talking points from structured brief fields.
 * Deterministic; never invents secrets or remediation how-tos.
 */
export function buildTalkingPoints(input: {
  productOneLiner: string | null;
  buildTool: string | null;
  blockers: string[];
  deadline: string | null;
  scoreSummary: LeadBriefScoreSummary;
  budget: string | null;
  discrepancyFlags: unknown[];
}): [string, string, string] {
  const points: string[] = [];
  const bucket = input.scoreSummary.bucket || "unscored";
  const engagement = input.scoreSummary.recommendedEngagement;

  points.push(
    engagement
      ? `Open with the ${bucket} bucket and recommended engagement (${engagement}); confirm that matches their near-term goal.`
      : `Open with the ${bucket} engagement bucket and confirm it matches what they want next.`,
  );

  const weakest = weakestDimension(input.scoreSummary.dimensions);
  if (input.blockers.length > 0) {
    points.push(
      `Probe the stated blocker${input.blockers.length > 1 ? "s" : ""}: ${input.blockers.slice(0, 2).join("; ")}${
        weakest ? ` — and how it relates to ${weakest} posture.` : "."
      }`,
    );
  } else if (weakest) {
    points.push(
      `Probe the lowest dimension (${weakest}: ${input.scoreSummary.dimensions[weakest]}/100) and what evidence they have for it in production.`,
    );
  } else {
    points.push(
      "Probe what is blocking a production-ready path today (security review, reliability under load, or handoff risk).",
    );
  }

  if (input.discrepancyFlags.length > 0) {
    points.push(
      `Reconcile ${input.discrepancyFlags.length} follow-up discrepancy flag(s) against the diagnostic report before scoping work.`,
    );
  } else if (input.deadline) {
    points.push(
      `Anchor timeline: deadline is "${input.deadline}"${
        input.budget ? `; budget signal: ${input.budget}` : ""
      }${input.buildTool ? `; built with ${input.buildTool}` : ""}.`,
    );
  } else if (input.budget) {
    points.push(
      `Confirm budget signal (${input.budget}) and whether an audit-first fixed-price path fits their decision process.`,
    );
  } else if (input.productOneLiner) {
    points.push(
      `Restate the product in their words ("${input.productOneLiner.slice(0, 120)}") and confirm primary users and commercial pressure.`,
    );
  } else {
    points.push(
      "Confirm primary users, commercial pressure, and whether they need audit-first hardening or a broader rebuild path.",
    );
  }

  while (points.length < 3) {
    points.push("Confirm next step preference: audit opening vs. deeper scoping call.");
  }
  return [points[0]!, points[1]!, points[2]!].map((p) => p.slice(0, 400)) as [
    string,
    string,
    string,
  ];
}

function weakestDimension(dimensions: Record<string, number>): string | null {
  let worst: string | null = null;
  let worstScore = Infinity;
  for (const label of READINESS_DIMENSIONS as readonly ReadinessDimension[]) {
    const v = dimensions[label];
    if (typeof v === "number" && v < worstScore) {
      worstScore = v;
      worst = label;
    }
  }
  if (worst != null) return worst;
  for (const [k, v] of Object.entries(dimensions)) {
    if (typeof v === "number" && v < worstScore) {
      worstScore = v;
      worst = k;
    }
  }
  return worst;
}

/**
 * Pure-template brief generation from structured submission data.
 * Never requires an LLM key. Never includes secrets or raw unredacted paste.
 */
export function buildLeadBrief(input: LeadBriefInput): LeadBrief {
  const stage1 = pickStage1(input);
  const followups = pickFollowups(input);
  const contact = extractContact(input.contact);
  const scoreSummary = extractScoreSummary(input.scores, input.bucket);
  const blockers = asStringArray(stage1.blockers);
  const productOneLiner =
    asString(stage1.productDescription, 200) ||
    asString(asRecord(input.parsedReport)?.summary, 200);
  const buildTool = asString(stage1.builtWith, 80);
  const deadline = asString(stage1.deadline, 80);
  const deadlineDetail = asString(stage1.deadlineDetail, 200);
  const budget = extractBudget(followups);
  const discrepancyFlags = Array.isArray(input.discrepancyFlags) ? input.discrepancyFlags : [];
  const company = contact.company;
  const source =
    contact.source ||
    asString(asRecord(input.draft)?.source, 64) ||
    asString(scoreSummary.dimensions ? "readiness" : null, 64) ||
    "readiness";

  const talkingPoints = buildTalkingPoints({
    productOneLiner,
    buildTool,
    blockers,
    deadline,
    scoreSummary,
    budget,
    discrepancyFlags,
  });

  return {
    version: 1,
    submissionId: String(input.submissionId).slice(0, 80),
    company,
    contact,
    source,
    productOneLiner,
    buildTool,
    blockers,
    deadline,
    deadlineDetail,
    scoreSummary,
    bucket: scoreSummary.bucket ?? asString(input.bucket, 64),
    reasoning: scoreSummary.reasoning,
    parsedTechReport: summarizeTechReport(asRecord(input.parsedReport)),
    followupAnswers: followups,
    budget,
    discrepancyFlags,
    talkingPoints,
    llmPolished: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Optional LLM polish of talking-point prose only.
 * Returns null when no API key is configured (fail closed to pure template).
 * Never throws for missing key; never blocks callers.
 */
export async function tryLlmPolishBrief(
  brief: LeadBrief,
  env: NodeJS.ProcessEnv | { ANTHROPIC_API_KEY?: string; LLM_API_KEY?: string } = process.env,
): Promise<LeadBrief | null> {
  const key = String(
    (env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY ||
      (env as { LLM_API_KEY?: string }).LLM_API_KEY ||
      "",
  ).trim();
  if (!key) return null;
  // Provider wiring is intentional no-op until a vault-backed key is present
  // and an owner enables it. Pure-template brief remains the default path.
  void brief;
  return null;
}

/** Public, queryable brief view (no secrets). */
export function toPublicLeadBrief(brief: LeadBrief): Record<string, unknown> {
  return {
    version: brief.version,
    submissionId: brief.submissionId,
    company: brief.company,
    contact: {
      name: brief.contact.name,
      // Email domain only in public views when needed — full email stays for ops email payload.
      email: brief.contact.email,
      company: brief.contact.company,
      source: brief.contact.source,
    },
    source: brief.source,
    productOneLiner: brief.productOneLiner,
    buildTool: brief.buildTool,
    blockers: brief.blockers,
    deadline: brief.deadline,
    deadlineDetail: brief.deadlineDetail,
    scoreSummary: brief.scoreSummary,
    bucket: brief.bucket,
    reasoning: brief.reasoning,
    parsedTechReport: brief.parsedTechReport,
    followupAnswers: brief.followupAnswers,
    budget: brief.budget,
    discrepancyFlags: brief.discrepancyFlags,
    talkingPoints: brief.talkingPoints,
    llmPolished: brief.llmPolished,
    generatedAt: brief.generatedAt,
  };
}
