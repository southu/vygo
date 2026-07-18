/**
 * Detailed written analysis + pattern-branched engagement recommendation.
 *
 * Pure functions: given dimension details, insights, and scores, produce
 * multi-paragraph per-dimension prose grounded in sub-metric evidence, plus a
 * recommendation section selected by score-pattern branching (not a single
 * generic pitch with swapped names).
 */

import {
  clipDisplayText,
  extractNamedTools,
  extractIntegrationCount,
  rawAnswerText,
  type EvidenceInsight,
} from "./evidence-insights.js";
import type {
  DimensionDetails,
  DimensionScores,
  EngagementBucket,
  ReadinessDimension,
  SubMetricScore,
} from "./readiness-scoring.js";

/** Local dimension order — mirrors READINESS_DIMENSIONS without a value import cycle. */
const ANALYSIS_DIMENSIONS: readonly ReadinessDimension[] = [
  "Security",
  "Reliability",
  "Operability",
  "Maintainability",
  "Compliance posture",
] as const;

/** One dimension's multi-paragraph written analysis. */
export type DimensionAnalysis = {
  dimension: string;
  /** Aggregate 0–100 score echoed for consumers. */
  score: number;
  /** At least two paragraphs of evidence-grounded prose. */
  paragraphs: string[];
  /** Joined prose for simple consumers (paragraphs separated by blank lines). */
  analysis: string;
};

/**
 * Detailed engagement recommendation produced by score-pattern branching.
 * Differs from the coarse bucket (Harden/Launch/Scale/Enterprise) when
 * sub-metric patterns call for a specialized fit (e.g. security-first).
 */
export type DetailedRecommendation = {
  /** Pattern key that selected this engagement (stable for tests). */
  patternKey: string;
  /** Specific Vygo service tier or engagement type name. */
  engagement: string;
  /** Why this engagement fits — multi-sentence rationale citing findings. */
  rationale: string;
  /**
   * At least 3 distinct findings drawn from the prospect's own data
   * (named sub-metrics, scores, or evidence items).
   */
  citedFindings: string[];
  /** Expected outcomes of the engagement. */
  expectedOutcomes: string;
  /** Suggested first-step scope of work. */
  firstStepScope: string;
  /** Full section body (rationale + outcomes + first step) for simple consumers. */
  body: string;
};

export type DetailedAnalysisPayload = {
  dimensionAnalyses: DimensionAnalysis[];
  recommendation: DetailedRecommendation;
};

function statusPhrase(status: SubMetricScore["status"], score: number): string {
  if (status === "strong") return `strong (${score}/100)`;
  if (status === "adequate") return `adequate (${score}/100)`;
  if (status === "at_risk") return `at risk (${score}/100)`;
  return `not assessed (scored as risk at ${score}/100)`;
}

function quoteAnswer(value: unknown, max = 120): string {
  const raw = rawAnswerText(value);
  if (!raw) return "not provided";
  const clipped = clipDisplayText(raw, max);
  return clipped || "not provided";
}

function bandLabel(score: number): string {
  if (score >= 70) return "strong";
  if (score >= 55) return "adequate";
  if (score >= 40) return "mixed";
  return "weak";
}

/**
 * Build 2+ paragraphs of analysis for a single dimension from its sub-metrics
 * and any matching insights. Always references actual evidence values.
 */
export function buildDimensionAnalysis(
  dimension: ReadinessDimension,
  detail: {
    score: number;
    checks: SubMetricScore[];
  },
  insights: EvidenceInsight[],
): DimensionAnalysis {
  const checks = detail.checks ?? [];
  const score = detail.score;
  const dimInsights = insights.filter((i) => i.dimension === dimension);

  // Sort weakest first so prose prioritizes material evidence.
  const ordered = [...checks].sort((a, b) => a.score - b.score);
  const weakest = ordered.slice(0, Math.min(3, ordered.length));
  const strongest = [...ordered].reverse().slice(0, Math.min(2, ordered.length));

  const evidenceLines = weakest.map((c) => {
    const answer = quoteAnswer(c.evidence?.answer_value);
    const reason =
      typeof c.evidence?.reason === "string" && c.evidence.reason.trim()
        ? c.evidence.reason.trim()
        : `Sub-metric ${c.name} scored ${c.score}/100.`;
    return `${c.name} is ${statusPhrase(c.status, c.score)}: you reported "${answer}". ${reason}`;
  });

  const strengthBits = strongest
    .filter((c) => c.score >= 55 && c.answered)
    .map((c) => {
      const answer = quoteAnswer(c.evidence?.answer_value, 80);
      return `${c.name} (${c.score}/100; "${answer}")`;
    });

  const insightBits = dimInsights.slice(0, 2).map((i) => {
    const src = i.source_answer ? ` — sourced from "${quoteAnswer(i.source_answer, 90)}"` : "";
    return `${i.headline}${src}`;
  });

  const p1Parts = [
    `On ${dimension}, your aggregate score is ${score}/100 (${bandLabel(score)}).`,
    evidenceLines.length > 0
      ? `The sub-metric evidence behind that score includes: ${evidenceLines.join(" ")}`
      : `Sub-metric checks for ${dimension} did not yield detailed answers, so this dimension is scored conservatively as risk.`,
  ];
  const paragraph1 = p1Parts.join(" ");

  const p2Parts: string[] = [];
  if (strengthBits.length > 0) {
    p2Parts.push(
      `Relative bright spots inside ${dimension} include ${strengthBits.join(" and ")}. These stronger checks do not erase the weaker ones; they define what can be preserved while the at-risk areas are hardened.`,
    );
  } else {
    p2Parts.push(
      `Across the ${dimension} checks, no sub-metric currently sits in a clearly strong band, so improvement work should treat this dimension as a first-class risk rather than a polish item.`,
    );
  }
  if (insightBits.length > 0) {
    p2Parts.push(
      `Insights drawn from your own answers reinforce this picture: ${insightBits.join("; ")}.`,
    );
  } else {
    // Still ground paragraph 2 in concrete check names/scores even without insights.
    const mid = ordered[Math.floor(ordered.length / 2)];
    if (mid) {
      p2Parts.push(
        `A mid-pack check worth tracking is ${mid.name} at ${mid.score}/100 (answer: "${quoteAnswer(mid.evidence?.answer_value, 80)}"), which sits between your weakest and strongest ${dimension} signals.`,
      );
    }
  }
  // Ensure multi-sentence substance.
  p2Parts.push(
    `Taken together, the ${dimension} profile is driven by the specific answers above rather than a generic maturity label — any engagement plan for this dimension should quote those sub-metrics by name.`,
  );
  const paragraph2 = p2Parts.join(" ");

  // Optional third paragraph when there are many checks — still only 2 required.
  const paragraphs = [paragraph1, paragraph2];

  return {
    dimension,
    score,
    paragraphs,
    analysis: paragraphs.join("\n\n"),
  };
}

export function buildAllDimensionAnalyses(
  dimensionDetails: DimensionDetails,
  insights: EvidenceInsight[],
): DimensionAnalysis[] {
  return ANALYSIS_DIMENSIONS.map((dim) => {
    const detail = dimensionDetails[dim];
    return buildDimensionAnalysis(dim, detail ?? { score: 0, checks: [] }, insights);
  });
}

// ---------------------------------------------------------------------------
// Tool-adoption / score-pattern helpers for recommendation branching
// ---------------------------------------------------------------------------

export type AdoptionSignals = {
  namedTools: string[];
  toolCount: number;
  integrationCount: number | null;
  /** True when the stack shows high tool/platform adoption. */
  highAdoption: boolean;
  /** True when adoption/ops surface is thin. */
  lowAdoption: boolean;
};

/** Integration / agentic platforms that signal multi-tool adoption surface. */
const ADOPTION_PLATFORM_HINT =
  /\b(zapier|make|n8n|langchain|llamaindex|crewai|autogpt|salesforce|hubspot|stripe|slack|openai|anthropic|pinecone|weaviate|segment|intercom|twilio|resend|sendgrid)\b/i;

export function deriveAdoptionSignals(
  report: Record<string, unknown>,
  dimensions: DimensionScores,
): AdoptionSignals {
  // Prefer integrations + summary for adoption — stack languages alone are not adoption.
  const integrationRaw = rawAnswerText(report.integrations);
  const summaryRaw = rawAnswerText(report.summary);
  const jobsRaw = rawAnswerText(report.background_jobs);
  const adoptionCorpus = [integrationRaw, summaryRaw, jobsRaw].filter(Boolean).join(" | ");
  const fullCorpus = [
    integrationRaw,
    summaryRaw,
    jobsRaw,
    rawAnswerText(report.frontend),
    rawAnswerText(report.backend),
    rawAnswerText(report.deploys),
  ]
    .filter(Boolean)
    .join(" | ");

  const namedFromIntegrations = extractNamedTools(adoptionCorpus);
  const namedTools =
    namedFromIntegrations.length > 0 ? namedFromIntegrations : extractNamedTools(fullCorpus);
  const integrationCount =
    extractIntegrationCount(integrationRaw) ?? extractIntegrationCount(adoptionCorpus);
  const platformHits = (adoptionCorpus.match(ADOPTION_PLATFORM_HINT) || []).length;
  const toolCount = integrationCount ?? Math.max(namedFromIntegrations.length, platformHits);
  const ops = dimensions.Operability ?? 0;
  const maint = dimensions.Maintainability ?? 0;

  const highAdoption =
    (integrationCount != null && integrationCount >= 3) ||
    namedFromIntegrations.length >= 3 ||
    platformHits >= 3 ||
    (namedFromIntegrations.length >= 2 && (ops + maint) / 2 >= 55) ||
    (integrationCount != null && integrationCount >= 5);

  const thinIntegrations =
    !integrationRaw ||
    /^(none|n\/a|na|unknown|not sure|tbd|-)$/i.test(integrationRaw.trim()) ||
    (integrationCount != null && integrationCount <= 1 && namedFromIntegrations.length <= 1);

  const lowAdoption =
    !highAdoption &&
    thinIntegrations &&
    namedFromIntegrations.length <= 1 &&
    (integrationCount == null || integrationCount <= 1) &&
    ops < 58;

  return {
    namedTools,
    toolCount: Math.max(toolCount, namedTools.length),
    integrationCount,
    highAdoption,
    lowAdoption,
  };
}

function collectCitedFindings(input: {
  report: Record<string, unknown>;
  dimensions: DimensionScores;
  dimensionDetails: DimensionDetails;
  insights: EvidenceInsight[];
  adoption: AdoptionSignals;
  limit?: number;
}): string[] {
  const { report, dimensions, dimensionDetails, insights, adoption, limit = 6 } = input;
  const findings: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t || t.length < 12) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(t);
  };

  // Dimension score findings (always available, submission-specific numbers).
  for (const dim of ANALYSIS_DIMENSIONS) {
    const score = dimensions[dim];
    if (typeof score === "number") {
      push(`${dim} score ${score}/100`);
    }
  }

  // Sub-metric evidence with answer values.
  for (const dim of ANALYSIS_DIMENSIONS) {
    const checks = dimensionDetails[dim]?.checks ?? [];
    for (const c of [...checks].sort((a, b) => a.score - b.score).slice(0, 3)) {
      const answer = quoteAnswer(c.evidence?.answer_value, 100);
      push(`${c.name} at ${c.score}/100 (you reported "${answer}")`);
    }
  }

  // Insights grounded in answers.
  for (const i of insights.slice(0, 4)) {
    push(i.headline);
    if (i.source_answer) {
      push(`Evidence: "${quoteAnswer(i.source_answer, 100)}"`);
    }
  }

  if (adoption.namedTools.length > 0) {
    push(`Named tools in your stack: ${adoption.namedTools.slice(0, 5).join(", ")}`);
  }
  if (adoption.integrationCount != null) {
    push(`Integration count reported: ${adoption.integrationCount}`);
  }

  // Raw report fields that often differ across profiles.
  for (const field of [
    "auth",
    "secrets_pattern",
    "tests",
    "deploys",
    "integrations",
    "pii_categories",
    "tenancy",
  ] as const) {
    const raw = rawAnswerText(report[field]);
    if (raw && !/^(unknown|n\/a|na|tbd)$/i.test(raw)) {
      push(`${field.replace(/_/g, " ")}: "${quoteAnswer(raw, 90)}"`);
    }
  }

  return findings.slice(0, limit);
}

type PatternBranch = {
  patternKey: string;
  engagement: string;
  /** Short fit sentence (no generic swap-in). */
  fitLead: string;
  expectedOutcomes: string;
  firstStepScope: string;
  offerHint: "harden" | "audit" | "build" | "general";
};

/**
 * Select engagement by real score-pattern branching.
 * First match wins — order is intentional.
 */
export function selectRecommendationPattern(input: {
  dimensions: DimensionScores;
  adoption: AdoptionSignals;
  bucket: EngagementBucket;
}): PatternBranch {
  const sec = dimensionsScore(input.dimensions, "Security");
  const rel = dimensionsScore(input.dimensions, "Reliability");
  const ops = dimensionsScore(input.dimensions, "Operability");
  const maint = dimensionsScore(input.dimensions, "Maintainability");
  const comp = dimensionsScore(input.dimensions, "Compliance posture");
  const { adoption, bucket } = input;

  const scores = [sec, rel, ops, maint, comp];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const midish = scores.every((s) => s >= 40 && s <= 68);
  const spread = max - min;

  // 1) Low security + high tool adoption → security-first remediation
  if (sec < 55 && adoption.highAdoption) {
    const tools =
      adoption.namedTools.length > 0
        ? adoption.namedTools.slice(0, 4).join(", ")
        : `${adoption.toolCount} integrations`;
    return {
      patternKey: "security_first_high_adoption",
      engagement: "Security-first Harden (security remediation engagement)",
      fitLead: `Your Security score is ${sec}/100 while tool adoption is high (${tools}) — a security-first engagement is the fit so credential and access controls catch up to the surface area you already operate.`,
      expectedOutcomes:
        "Centralized secrets handling, hardened auth/authorization baselines, reduced credential sprawl across your named tools, and a short written control map the team can operate without a full multi-tenant rebuild.",
      firstStepScope:
        "Week-1 security remediation spike: inventory secrets and auth paths for each named integration, close the top three at-risk Security sub-metrics, and produce a fixed-scope Harden plan with acceptance checks.",
      offerHint: "harden",
    };
  }

  // 2) High security + low adoption → foundation / adoption acceleration
  // Also match when security is clearly the strongest dimension and integrations are thin.
  if (
    (sec >= 65 && adoption.lowAdoption) ||
    (sec >= 65 &&
      sec >= rel + 15 &&
      sec >= ops + 10 &&
      !adoption.highAdoption &&
      adoption.lowAdoption)
  ) {
    return {
      patternKey: "high_security_low_adoption",
      engagement: "Launch foundations (operability & adoption acceleration)",
      fitLead: `Security is relatively strong at ${sec}/100, but adoption and operability signals are thin (Operability ${ops}/100, Maintainability ${maint}/100, few named platforms) — the fit is a Launch foundations engagement that turns solid controls into a shippable operating model.`,
      expectedOutcomes:
        "Repeatable deploys, clearer environment split, documented runbooks, and a small set of production integrations that expand adoption without eroding the security baseline you already have.",
      firstStepScope:
        "First-step scope: Production Readiness Audit focused on deploys, environments, and the top Maintainability/Operability sub-metric gaps, then a fixed Launch work package to implement the first operating slice.",
      offerHint: "audit",
    };
  }

  // 3) Uniform mid scores → balanced audit
  if (midish && spread <= 22) {
    return {
      patternKey: "uniform_mid_scores",
      engagement: "Production Readiness Audit (balanced mid-maturity path)",
      fitLead: `Your five dimension scores sit in a mid band (Security ${sec}, Reliability ${rel}, Operability ${ops}, Maintainability ${maint}, Compliance ${comp}) without a single extreme outlier — a balanced Production Readiness Audit is the right engagement to pick the first fixed-scope rebuild rather than guessing a specialty path.`,
      expectedOutcomes:
        "A scored backlog ranked by risk and commercial pressure, a recommended Launch/Scale/Enterprise/Harden path with price lock, and clarity on which mid-maturity gaps must close before growth or enterprise sales.",
      firstStepScope:
        "First-step scope: two-week Production Readiness Audit that re-validates each dimension’s weakest sub-metrics against your pasted evidence, then delivers a fixed-price build recommendation with credit for the audit fee.",
      offerHint: "audit",
    };
  }

  // 4) Reliability is the clear worst dimension
  if (rel < 55 && rel <= sec - 8 && rel <= ops - 5) {
    return {
      patternKey: "reliability_first",
      engagement: "Reliability stabilization (via Production Readiness Audit)",
      fitLead: `Reliability at ${rel}/100 is the clearest drag on readiness compared with Security ${sec}/100 and Operability ${ops}/100 — a reliability-first stabilization engagement is the fit before scaling features or sales pressure.`,
      expectedOutcomes:
        "Automated test gates, safer error handling, visibility into background work, and fewer self-reported fragility flags so releases stop depending on heroics.",
      firstStepScope:
        "First-step scope: audit the tests, error_handling, logging, and fragility_flags sub-metrics; implement a minimal CI gate and one production-path integration/e2e check as the opening work package.",
      offerHint: "audit",
    };
  }

  // 5) Compliance / sensitive data pressure with soft controls
  if (comp < 55 && sec < 60) {
    return {
      patternKey: "compliance_security",
      engagement: "Compliance-aware Scale path (via Production Readiness Audit)",
      fitLead: `Compliance posture at ${comp}/100 combined with Security ${sec}/100 indicates identity, isolation, or sensitive-data pressure that outruns current controls — Scale (compliance-aware) via audit is the fit.`,
      expectedOutcomes:
        "Clear tenancy/isolation story, access control baseline suitable for questionnaires, and a rebuild plan that treats compliance evidence as a deliverable rather than an afterthought.",
      firstStepScope:
        "First-step scope: Production Readiness Audit mapped to questionnaire-ready controls (auth, authorization, secrets, PII categories), then a Scale engagement proposal with explicit compliance milestones.",
      offerHint: "audit",
    };
  }

  // 6) Fall back to coarse bucket mapping — still with pattern-specific copy
  if (bucket === "Harden") {
    return {
      patternKey: "bucket_harden",
      engagement: "vygo Harden",
      fitLead: `Score pattern and user model map to Harden: Security ${sec}/100, Reliability ${rel}/100, Operability ${ops}/100 on a focused internal-tool surface rather than a full multi-tenant rebuild.`,
      expectedOutcomes:
        "Team-ready access control, reliable hosting, backups/recovery basics, and documentation so the internal workflow no longer depends on the original builder alone.",
      firstStepScope:
        "First-step scope: free Harden fit assessment against your weakest sub-metrics, then a fixed $9,500 two-week engagement if the tool matches Harden criteria.",
      offerHint: "harden",
    };
  }
  if (bucket === "Enterprise") {
    return {
      patternKey: "bucket_enterprise",
      engagement: "Enterprise rebuild (via Production Readiness Audit)",
      fitLead: `Enterprise or multi-tenant pressure with dimension scores Security ${sec}/100 and Compliance ${comp}/100 selects an Enterprise rebuild path rather than a lightweight fix.`,
      expectedOutcomes:
        "SSO/tenancy-ready foundations, questionnaire-defensible controls, and a fixed-scope Enterprise rebuild plan after audit.",
      firstStepScope:
        "First-step scope: Production Readiness Audit sized for enterprise identity, tenancy, and compliance evidence, with the audit fee credited toward the Enterprise rebuild.",
      offerHint: "audit",
    };
  }
  if (bucket === "Scale") {
    return {
      patternKey: "bucket_scale",
      engagement: "Scale rebuild (via Production Readiness Audit)",
      fitLead: `Commercial growth pressure with soft foundations (Reliability ${rel}/100, Compliance ${comp}/100) selects Scale rather than Harden or a pure Launch path.`,
      expectedOutcomes:
        "A rebuild plan that absorbs paying-user and questionnaire pressure without freezing product delivery for months of open-ended consulting.",
      firstStepScope:
        "First-step scope: Production Readiness Audit focused on reliability and compliance sub-metrics that commercial deals will probe first.",
      offerHint: "audit",
    };
  }
  if (bucket === "Not a fit") {
    return {
      patternKey: "bucket_not_a_fit",
      engagement: "Not a fit yet",
      fitLead:
        "The submission does not yet describe a working product surface we can engage on — no audit or rebuild path is appropriate until basics are present.",
      expectedOutcomes:
        "A clear bar for returning: runnable build, stack answers, and enough usage context to score production readiness.",
      firstStepScope:
        "First-step scope: return when you have an MVP in market (or nearly there) and re-run this readiness check with a complete diagnostic paste.",
      offerHint: "general",
    };
  }

  // Default Launch
  return {
    patternKey: "bucket_launch",
    engagement: "Launch rebuild (via Production Readiness Audit)",
    fitLead: `Foundational gaps across dimensions (Security ${sec}/100, Reliability ${rel}/100, Operability ${ops}/100) select Launch — put production foundations under fixed scope before growth compounds risk.`,
    expectedOutcomes:
      "Auth, deploys, tests, and operability baselines good enough for real users, with a fixed price and a credited audit.",
    firstStepScope:
      "First-step scope: Production Readiness Audit that locks Launch scope and price from your weakest sub-metrics, then a fixed Launch rebuild package.",
    offerHint: "audit",
  };
}

function dimensionsScore(dimensions: DimensionScores, dim: ReadinessDimension): number {
  const n = dimensions[dim];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Build the full detailed recommendation for a scored submission.
 */
export function buildDetailedRecommendation(input: {
  report: Record<string, unknown>;
  dimensions: DimensionScores;
  dimensionDetails: DimensionDetails;
  insights: EvidenceInsight[];
  bucket: EngagementBucket;
}): DetailedRecommendation {
  const adoption = deriveAdoptionSignals(input.report, input.dimensions);
  const branch = selectRecommendationPattern({
    dimensions: input.dimensions,
    adoption,
    bucket: input.bucket,
  });

  // Prefer findings that match the pattern so citations feel native to the path.
  const allFindings = collectCitedFindings({
    report: input.report,
    dimensions: input.dimensions,
    dimensionDetails: input.dimensionDetails,
    insights: input.insights,
    adoption,
    limit: 10,
  });

  // Ensure Security score appears for security-first; tools for high adoption, etc.
  const preferred: string[] = [];
  if (branch.patternKey === "security_first_high_adoption") {
    preferred.push(
      ...allFindings.filter((f) => /security|auth|secret|tool|integration|credential/i.test(f)),
    );
  } else if (branch.patternKey === "high_security_low_adoption") {
    preferred.push(
      ...allFindings.filter((f) => /security|operab|maintain|deploy|environment|tool/i.test(f)),
    );
  } else if (branch.patternKey === "uniform_mid_scores") {
    preferred.push(...allFindings.filter((f) => /score \d+\/100/i.test(f)));
  } else if (branch.patternKey === "reliability_first") {
    preferred.push(...allFindings.filter((f) => /reliab|test|fragil|error|logging/i.test(f)));
  }

  const citedFindings: string[] = [];
  for (const f of [...preferred, ...allFindings]) {
    if (citedFindings.length >= 5) break;
    if (!citedFindings.includes(f)) citedFindings.push(f);
  }
  // Guarantee at least 3 even on sparse reports.
  while (citedFindings.length < 3) {
    const dim = ANALYSIS_DIMENSIONS[citedFindings.length % ANALYSIS_DIMENSIONS.length]!;
    const score = dimensionsScore(input.dimensions, dim);
    const filler = `${dim} scored ${score}/100 on this submission`;
    if (!citedFindings.includes(filler)) citedFindings.push(filler);
    else break;
  }

  const findingsBlock = citedFindings
    .slice(0, Math.max(3, Math.min(5, citedFindings.length)))
    .map((f, i) => `(${i + 1}) ${f}`)
    .join(" ");

  const rationale = [
    branch.fitLead,
    `Why this prospect specifically: ${findingsBlock}`,
    `Those findings come from this submission’s sub-metric evidence and answers, not a generic maturity pitch.`,
  ].join(" ");

  const body = [
    rationale,
    `Expected outcomes: ${branch.expectedOutcomes}`,
    `Suggested first-step scope of work: ${branch.firstStepScope}`,
  ].join("\n\n");

  return {
    patternKey: branch.patternKey,
    engagement: branch.engagement,
    rationale,
    citedFindings: citedFindings.slice(0, 5),
    expectedOutcomes: branch.expectedOutcomes,
    firstStepScope: branch.firstStepScope,
    body,
  };
}

/**
 * Full detailed analysis package for a scored readiness submission.
 */
export function buildDetailedAnalysis(input: {
  report: Record<string, unknown>;
  dimensions: DimensionScores;
  dimensionDetails: DimensionDetails;
  insights: EvidenceInsight[];
  bucket: EngagementBucket;
}): DetailedAnalysisPayload {
  const dimensionAnalyses = buildAllDimensionAnalyses(input.dimensionDetails, input.insights);
  const recommendation = buildDetailedRecommendation(input);
  return { dimensionAnalyses, recommendation };
}
