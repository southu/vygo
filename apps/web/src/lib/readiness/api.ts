/**
 * Browser client for readiness APIs. All calls are same-origin on www.vygo.ai
 * via apiUrl() — never a separate API host.
 */
import { apiUrl } from "@/lib/api";
import type { ManualAnswers, ReadinessStage1Answers } from "@vygo/validation";

export type SessionResponse = {
  token: string;
  stage: string;
  draft: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type ParseResponse = {
  token?: string;
  stage?: string;
  parseStatus: "ok" | "partial" | "pending" | "error" | string;
  stack: string;
  size: string;
  findings: string[];
  report?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  note?: string;
};

export type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function createReadinessSession(input?: {
  stage?: string;
  draft?: Record<string, unknown>;
}): Promise<SessionResponse> {
  const res = await fetch(apiUrl("/v1/readiness/session"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input ?? {}),
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok || typeof body.token !== "string") {
    const msg =
      (body.error as { message?: string } | undefined)?.message ||
      "Could not start a session. Please try again.";
    throw new Error(msg);
  }
  return body as unknown as SessionResponse;
}

export async function getReadinessSession(token: string): Promise<SessionResponse> {
  const res = await fetch(apiUrl(`/v1/readiness/session/${encodeURIComponent(token)}`), {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok || typeof body.token !== "string") {
    const msg = (body.error as { message?: string } | undefined)?.message || "Session not found.";
    throw new Error(msg);
  }
  return body as unknown as SessionResponse;
}

export async function patchReadinessSession(
  token: string,
  input: { stage?: string; draft?: Record<string, unknown> },
): Promise<SessionResponse> {
  const res = await fetch(apiUrl(`/v1/readiness/session/${encodeURIComponent(token)}`), {
    method: "PATCH",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok || typeof body.token !== "string") {
    const msg =
      (body.error as { message?: string } | undefined)?.message || "Could not save progress.";
    throw new Error(msg);
  }
  return body as unknown as SessionResponse;
}

export async function logReadinessLead(input: {
  token?: string | null;
  reason: string;
  answers?: Partial<ReadinessStage1Answers> | Record<string, unknown>;
  email?: string;
}): Promise<{ ok: true; status: number }> {
  const res = await fetch(apiUrl("/v1/readiness/lead"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const msg = (body.error as { message?: string } | undefined)?.message || "Could not log lead.";
    throw new Error(msg);
  }
  return { ok: true, status: res.status };
}

export async function emailReadinessPrompt(input: {
  email: string;
  token: string;
  prompt: string;
}): Promise<{ ok: true; status: number; resumeUrl?: string }> {
  const res = await fetch(apiUrl("/v1/readiness/email-prompt"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const msg =
      (body.error as { message?: string } | undefined)?.message || "Could not send email.";
    throw new Error(msg);
  }
  return {
    ok: true,
    status: res.status,
    resumeUrl: typeof body.resumeUrl === "string" ? body.resumeUrl : undefined,
  };
}

/**
 * Submit paste for server-side parse. On network/endpoint failure the caller
 * should show a graceful pending confirmation from the client-side partial parse.
 * Never call this with text that failed the client secret scan.
 */
export async function parseReadinessPaste(input: {
  token: string;
  paste: string;
}): Promise<ParseResponse> {
  const res = await fetch(apiUrl("/v1/readiness/parse"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ token: input.token, paste: input.paste }),
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const code = (body.error as { code?: string } | undefined)?.code;
    const msg =
      (body.error as { message?: string } | undefined)?.message || "Could not parse paste.";
    const err = new Error(msg) as Error & { status?: number; code?: string; lines?: number[] };
    err.status = res.status;
    err.code = code;
    if (Array.isArray(body.lines)) err.lines = body.lines as number[];
    throw err;
  }
  return {
    token: typeof body.token === "string" ? body.token : input.token,
    stage: typeof body.stage === "string" ? body.stage : "confirm",
    parseStatus: typeof body.parseStatus === "string" ? body.parseStatus : "pending",
    stack: typeof body.stack === "string" ? body.stack : "Not yet determined",
    size: typeof body.size === "string" ? body.size : "Not yet determined",
    findings: Array.isArray(body.findings)
      ? (body.findings as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    report:
      body.report && typeof body.report === "object" && !Array.isArray(body.report)
        ? (body.report as Record<string, unknown>)
        : undefined,
    draft:
      body.draft && typeof body.draft === "object" && !Array.isArray(body.draft)
        ? (body.draft as Record<string, unknown>)
        : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  };
}

export function draftFromStage1(
  stage1: Partial<ReadinessStage1Answers>,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    stage1,
    ...extra,
  };
}

export function stage1FromDraft(draft: Record<string, unknown>): Partial<ReadinessStage1Answers> {
  const s = draft.stage1;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    return s as Partial<ReadinessStage1Answers>;
  }
  // Legacy flat keys
  return {
    productDescription:
      typeof draft.productDescription === "string" ? draft.productDescription : undefined,
    whoUses: typeof draft.whoUses === "string" ? (draft.whoUses as never) : undefined,
    builtWith: typeof draft.builtWith === "string" ? (draft.builtWith as never) : undefined,
    blockers: Array.isArray(draft.blockers) ? (draft.blockers as never) : undefined,
    deadline: typeof draft.deadline === "string" ? (draft.deadline as never) : undefined,
    deadlineDetail: typeof draft.deadlineDetail === "string" ? draft.deadlineDetail : undefined,
  };
}

export function pasteTextFromDraft(draft: Record<string, unknown>): string {
  return typeof draft.pasteText === "string" ? draft.pasteText : "";
}

export function manualAnswersFromDraft(draft: Record<string, unknown>): ManualAnswers | null {
  const m = draft.manualAnswers;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    return m as ManualAnswers;
  }
  return null;
}

export type ScoreResponse = {
  snapshotId: string;
  id?: string;
  scores: Record<string, number>;
  dimensions?: Record<string, number>;
  dimensionDetails?: Record<string, SnapshotDimensionDetail> | null;
  /** Mission-shaped: [{ dimension, score, sub_metrics: [{ name, score, weight, evidence }] }] */
  dimensionResults?: SnapshotDimensionResult[] | null;
  dimensionAnalyses?: SnapshotDimensionAnalysis[] | null;
  recommendation?: SnapshotRecommendation | null;
  ranges?: Record<string, { low: number; high: number; mid: number }> | null;
  displayMode?: "point" | "range";
  overall?: number;
  bucket: string;
  reasoning: string;
  caveat?: string | null;
  findings: string[];
  recommendedEngagement?: string;
  offerKey?: string;
  ctaLabel?: string;
  pricing?: Record<string, string>;
  source?: string;
  snapshotPath?: string;
};

export type SnapshotSubMetricStatus = "strong" | "adequate" | "at_risk" | "unknown";

export type SnapshotSubMetricEvidence = {
  question_id: string;
  answer_value: unknown;
  reason: string;
};

export type SnapshotSubMetric = {
  key: string;
  label: string;
  name?: string;
  score: number;
  weight: number;
  answered: boolean;
  status: SnapshotSubMetricStatus;
  evidence?: SnapshotSubMetricEvidence | null;
};

export type SnapshotDimensionDetail = {
  label: string;
  score: number;
  weight: number;
  checks: SnapshotSubMetric[];
  sub_metrics?: Array<{
    name: string;
    score: number;
    weight: number;
    evidence: SnapshotSubMetricEvidence;
  }>;
};

/** Mission-shaped dimension result array entry. */
export type SnapshotDimensionResult = {
  dimension: string;
  score: number;
  sub_metrics: Array<{
    name: string;
    score: number;
    weight: number;
    evidence: SnapshotSubMetricEvidence;
  }>;
};

/** Multi-paragraph written analysis for one scoring dimension. */
export type SnapshotDimensionAnalysis = {
  dimension: string;
  score: number;
  paragraphs: string[];
  analysis: string;
};

/** Pattern-branched detailed engagement recommendation. */
export type SnapshotRecommendation = {
  patternKey: string;
  engagement: string;
  rationale: string;
  citedFindings: string[];
  expectedOutcomes: string;
  firstStepScope: string;
  body: string;
};

export type SnapshotResponse = {
  id: string;
  snapshotId?: string;
  scores: Record<string, number> | null;
  dimensions?: Record<string, number> | null;
  dimensionDetails?: Record<string, SnapshotDimensionDetail> | null;
  dimensionResults?: SnapshotDimensionResult[] | null;
  dimensionAnalyses?: SnapshotDimensionAnalysis[] | null;
  recommendation?: SnapshotRecommendation | null;
  ranges?: Record<string, { low: number; high: number; mid: number }> | null;
  displayMode?: "point" | "range";
  overall?: number | null;
  bucket: string | null;
  reasoning: string | null;
  caveat?: string | null;
  findings: string[];
  recommendedEngagement?: string | null;
  offerKey?: string;
  ctaLabel?: string;
  pricing?: {
    harden?: string;
    launch?: string;
    scale?: string;
    enterprise?: string;
    auditNote?: string;
  } | null;
  source?: string | null;
  contact?: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
  } | null;
  reportSummary?: Record<string, unknown> | null;
  createdAt?: string;
};

/** Gate + score. Requires name, email, privacy consent, and Turnstile token. */
export async function scoreReadiness(input: {
  token: string;
  name: string;
  email: string;
  company?: string;
  privacyAccepted: boolean;
  turnstileToken: string;
  source?: string;
}): Promise<ScoreResponse> {
  const res = await fetch(apiUrl("/v1/readiness/score"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      token: input.token,
      name: input.name,
      email: input.email,
      company: input.company || undefined,
      privacyAccepted: input.privacyAccepted,
      privacyConsent: input.privacyAccepted,
      turnstileToken: input.turnstileToken,
      source: input.source,
    }),
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const fields = (body.error as { fields?: Record<string, string> } | undefined)?.fields;
    const msg =
      (body.error as { message?: string } | undefined)?.message ||
      "Could not compute readiness scores.";
    const err = new Error(msg) as Error & {
      status?: number;
      code?: string;
      fields?: Record<string, string>;
    };
    err.status = res.status;
    err.code = (body.error as { code?: string } | undefined)?.code;
    err.fields = fields;
    throw err;
  }
  const snapshotId =
    typeof body.snapshotId === "string"
      ? body.snapshotId
      : typeof body.id === "string"
        ? body.id
        : "";
  if (!snapshotId) {
    throw new Error("Score response missing snapshot id.");
  }
  return {
    snapshotId,
    id: snapshotId,
    scores:
      body.scores && typeof body.scores === "object" && !Array.isArray(body.scores)
        ? (body.scores as Record<string, number>)
        : body.dimensions && typeof body.dimensions === "object"
          ? (body.dimensions as Record<string, number>)
          : {},
    dimensions:
      body.dimensions && typeof body.dimensions === "object"
        ? (body.dimensions as Record<string, number>)
        : undefined,
    dimensionDetails: parseDimensionDetails(body.dimensionDetails),
    dimensionResults: parseDimensionResults(body.dimensionResults),
    dimensionAnalyses: parseDimensionAnalyses(body.dimensionAnalyses),
    recommendation: parseRecommendation(body.recommendation),
    ranges:
      body.ranges && typeof body.ranges === "object"
        ? (body.ranges as ScoreResponse["ranges"])
        : null,
    displayMode: body.displayMode === "range" ? "range" : "point",
    overall: typeof body.overall === "number" ? body.overall : undefined,
    bucket: typeof body.bucket === "string" ? body.bucket : "Launch",
    reasoning: typeof body.reasoning === "string" ? body.reasoning : "",
    caveat: typeof body.caveat === "string" ? body.caveat : null,
    findings: Array.isArray(body.findings)
      ? (body.findings as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    recommendedEngagement:
      typeof body.recommendedEngagement === "string" ? body.recommendedEngagement : undefined,
    offerKey: typeof body.offerKey === "string" ? body.offerKey : undefined,
    ctaLabel: typeof body.ctaLabel === "string" ? body.ctaLabel : undefined,
    pricing:
      body.pricing && typeof body.pricing === "object"
        ? (body.pricing as Record<string, string>)
        : undefined,
    source: typeof body.source === "string" ? body.source : undefined,
    snapshotPath:
      typeof body.snapshotPath === "string"
        ? body.snapshotPath
        : `/readiness/snapshot?id=${encodeURIComponent(snapshotId)}`,
  };
}

const SUB_METRIC_STATUSES: ReadonlySet<string> = new Set([
  "strong",
  "adequate",
  "at_risk",
  "unknown",
]);

function parseEvidence(raw: unknown): SnapshotSubMetricEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ev = raw as Record<string, unknown>;
  const question_id = typeof ev.question_id === "string" ? ev.question_id.trim() : "";
  const reason = typeof ev.reason === "string" ? ev.reason.trim() : "";
  if (!question_id || !reason) return null;
  return {
    question_id,
    answer_value: "answer_value" in ev ? ev.answer_value : null,
    reason,
  };
}

function parseDimensionResults(raw: unknown): SnapshotDimensionResult[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SnapshotDimensionResult[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const dim = entry as Record<string, unknown>;
    const dimension = typeof dim.dimension === "string" ? dim.dimension.trim() : "";
    if (!dimension) continue;
    const sub_metrics = Array.isArray(dim.sub_metrics)
      ? (dim.sub_metrics as unknown[]).flatMap((sm) => {
          if (!sm || typeof sm !== "object" || Array.isArray(sm)) return [];
          const row = sm as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name.trim() : "";
          const evidence = parseEvidence(row.evidence);
          if (!name || !evidence) return [];
          return [
            {
              name,
              score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0,
              weight:
                typeof row.weight === "number" && Number.isFinite(row.weight) ? row.weight : 1,
              evidence,
            },
          ];
        })
      : [];
    out.push({
      dimension,
      score: typeof dim.score === "number" && Number.isFinite(dim.score) ? dim.score : 0,
      sub_metrics,
    });
  }
  return out.length > 0 ? out : null;
}

function parseDimensionAnalyses(raw: unknown): SnapshotDimensionAnalysis[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SnapshotDimensionAnalysis[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const dimension = typeof row.dimension === "string" ? row.dimension.trim() : "";
    if (!dimension) continue;
    const paragraphs = Array.isArray(row.paragraphs)
      ? (row.paragraphs as unknown[])
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .map((p) => p.trim())
      : [];
    const analysis =
      typeof row.analysis === "string" && row.analysis.trim()
        ? row.analysis.trim()
        : paragraphs.join("\n\n");
    if (paragraphs.length < 2 && analysis.split(/\n\n+/).filter(Boolean).length < 2) continue;
    out.push({
      dimension,
      score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0,
      paragraphs:
        paragraphs.length >= 2
          ? paragraphs
          : analysis
              .split(/\n\n+/)
              .map((p) => p.trim())
              .filter(Boolean),
      analysis,
    });
  }
  return out.length > 0 ? out : null;
}

function parseRecommendation(raw: unknown): SnapshotRecommendation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const engagement = typeof r.engagement === "string" ? r.engagement.trim() : "";
  const rationale = typeof r.rationale === "string" ? r.rationale.trim() : "";
  const expectedOutcomes =
    typeof r.expectedOutcomes === "string" ? r.expectedOutcomes.trim() : "";
  const firstStepScope = typeof r.firstStepScope === "string" ? r.firstStepScope.trim() : "";
  if (!engagement || !rationale) return null;
  const citedFindings = Array.isArray(r.citedFindings)
    ? (r.citedFindings as unknown[])
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim())
    : [];
  const body =
    typeof r.body === "string" && r.body.trim()
      ? r.body.trim()
      : [rationale, expectedOutcomes && `Expected outcomes: ${expectedOutcomes}`, firstStepScope && `Suggested first-step scope of work: ${firstStepScope}`]
          .filter(Boolean)
          .join("\n\n");
  return {
    patternKey: typeof r.patternKey === "string" ? r.patternKey : "",
    engagement,
    rationale,
    citedFindings,
    expectedOutcomes,
    firstStepScope,
    body,
  };
}

function parseDimensionDetails(raw: unknown): Record<string, SnapshotDimensionDetail> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, SnapshotDimensionDetail> = {};
  for (const [dim, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const detail = value as Record<string, unknown>;
    const checks: SnapshotSubMetric[] = Array.isArray(detail.checks)
      ? (detail.checks as unknown[]).flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const check = entry as Record<string, unknown>;
          if (typeof check.key !== "string" || !check.key) return [];
          const label = typeof check.label === "string" && check.label ? check.label : check.key;
          return [
            {
              key: check.key,
              label,
              name: typeof check.name === "string" && check.name ? check.name : label,
              score:
                typeof check.score === "number" && Number.isFinite(check.score) ? check.score : 0,
              weight:
                typeof check.weight === "number" && Number.isFinite(check.weight)
                  ? check.weight
                  : 1,
              answered: check.answered !== false,
              status:
                typeof check.status === "string" && SUB_METRIC_STATUSES.has(check.status)
                  ? (check.status as SnapshotSubMetricStatus)
                  : "unknown",
              evidence: parseEvidence(check.evidence),
            },
          ];
        })
      : [];
    const sub_metrics = Array.isArray(detail.sub_metrics)
      ? (detail.sub_metrics as unknown[]).flatMap((sm) => {
          if (!sm || typeof sm !== "object" || Array.isArray(sm)) return [];
          const row = sm as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name.trim() : "";
          const evidence = parseEvidence(row.evidence);
          if (!name || !evidence) return [];
          return [
            {
              name,
              score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0,
              weight:
                typeof row.weight === "number" && Number.isFinite(row.weight) ? row.weight : 1,
              evidence,
            },
          ];
        })
      : checks
          .filter((c) => c.evidence)
          .map((c) => ({
            name: c.name ?? c.label,
            score: c.score,
            weight: c.weight,
            evidence: c.evidence as SnapshotSubMetricEvidence,
          }));
    out[dim] = {
      label: typeof detail.label === "string" && detail.label ? detail.label : dim,
      score: typeof detail.score === "number" && Number.isFinite(detail.score) ? detail.score : 0,
      weight:
        typeof detail.weight === "number" && Number.isFinite(detail.weight) ? detail.weight : 1,
      checks,
      sub_metrics,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function getReadinessSnapshot(id: string): Promise<SnapshotResponse> {
  const res = await fetch(apiUrl(`/v1/readiness/snapshot/${encodeURIComponent(id)}`), {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const msg = (body.error as { message?: string } | undefined)?.message || "Snapshot not found.";
    throw new Error(msg);
  }
  const scores =
    body.dimensions && typeof body.dimensions === "object"
      ? (body.dimensions as Record<string, number>)
      : body.scores && typeof body.scores === "object" && !Array.isArray(body.scores)
        ? (body.scores as Record<string, number>)
        : null;
  return {
    id: typeof body.id === "string" ? body.id : id,
    snapshotId: typeof body.snapshotId === "string" ? body.snapshotId : id,
    scores,
    dimensions: scores,
    dimensionDetails: parseDimensionDetails(body.dimensionDetails),
    dimensionResults: parseDimensionResults(body.dimensionResults),
    dimensionAnalyses: parseDimensionAnalyses(body.dimensionAnalyses),
    recommendation: parseRecommendation(body.recommendation),
    ranges:
      body.ranges && typeof body.ranges === "object"
        ? (body.ranges as SnapshotResponse["ranges"])
        : null,
    displayMode: body.displayMode === "range" ? "range" : "point",
    overall: typeof body.overall === "number" ? body.overall : null,
    bucket: typeof body.bucket === "string" ? body.bucket : null,
    reasoning: typeof body.reasoning === "string" ? body.reasoning : null,
    caveat: typeof body.caveat === "string" ? body.caveat : null,
    findings: Array.isArray(body.findings)
      ? (body.findings as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    recommendedEngagement:
      typeof body.recommendedEngagement === "string" ? body.recommendedEngagement : null,
    offerKey: typeof body.offerKey === "string" ? body.offerKey : "audit",
    ctaLabel:
      typeof body.ctaLabel === "string" ? body.ctaLabel : "Apply for the next audit opening",
    pricing:
      body.pricing && typeof body.pricing === "object"
        ? (body.pricing as SnapshotResponse["pricing"])
        : null,
    source: typeof body.source === "string" ? body.source : null,
    contact:
      body.contact && typeof body.contact === "object"
        ? (body.contact as SnapshotResponse["contact"])
        : null,
    reportSummary:
      body.reportSummary && typeof body.reportSummary === "object"
        ? (body.reportSummary as Record<string, unknown>)
        : null,
    createdAt: typeof body.createdAt === "string" ? body.createdAt : undefined,
  };
}

export async function emailReadinessSnapshot(input: {
  id: string;
  email?: string;
}): Promise<{ ok: true; status: number }> {
  const res = await fetch(apiUrl(`/v1/readiness/snapshot/${encodeURIComponent(input.id)}/email`), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input.email ? { email: input.email } : {}),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const msg =
      (body.error as { message?: string } | undefined)?.message || "Could not email snapshot.";
    throw new Error(msg);
  }
  return { ok: true, status: res.status };
}
