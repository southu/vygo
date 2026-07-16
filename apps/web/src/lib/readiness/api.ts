/**
 * Browser client for readiness APIs. All calls are same-origin on www.vygo.ai
 * (never api.vygo.ai) via apiUrl().
 */
import { apiUrl } from "@/lib/api";
import type { ReadinessStage1Answers } from "@vygo/validation";

export type SessionResponse = {
  token: string;
  stage: string;
  draft: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
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
    const msg =
      (body.error as { message?: string } | undefined)?.message || "Session not found.";
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
    const msg =
      (body.error as { message?: string } | undefined)?.message || "Could not log lead.";
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
    deadlineDetail:
      typeof draft.deadlineDetail === "string" ? draft.deadlineDetail : undefined,
  };
}
