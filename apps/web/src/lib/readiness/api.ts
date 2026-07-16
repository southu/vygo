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
