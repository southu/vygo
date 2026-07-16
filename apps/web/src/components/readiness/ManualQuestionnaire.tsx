"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MANUAL_CONFIDENCE_LABEL,
  MANUAL_QUESTIONNAIRE,
  MANUAL_SOURCE,
  buildManualSessionDraft,
  emptyManualAnswers,
  isManualQuestionnaireComplete,
  type ManualAnswers,
} from "@vygo/validation";
import { readinessContent } from "@/content/readiness";
import {
  createReadinessSession,
  getReadinessSession,
  manualAnswersFromDraft,
  patchReadinessSession,
  stage1FromDraft,
  type ScoreResponse,
} from "@/lib/readiness/api";
import {
  loadReadinessLocal,
  saveReadinessLocal,
  type ReadinessLocalState,
} from "@/lib/readiness/storage";
import { ScoreGateForm } from "@/components/readiness/ScoreGateForm";

function resumeTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get("token")?.trim();
    return t && t.length >= 16 ? t : null;
  } catch {
    return null;
  }
}

export function ManualQuestionnaire() {
  const c = readinessContent.fallback;
  const [token, setToken] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ManualAnswers>(() => emptyManualAnswers());
  const [stage1, setStage1] = useState<Record<string, unknown>>({});
  const stage1Ref = useRef<Record<string, unknown>>({});
  const [status, setStatus] = useState<
    "loading" | "form" | "submitting" | "gate" | "done" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMeta, setSavedMeta] = useState<{ source: string; confidence: string } | null>(null);

  const persistLocal = useCallback(
    (next: ManualAnswers, sessionToken: string | null, stage: string) => {
      const local: ReadinessLocalState = {
        token: sessionToken,
        stage,
        stage1: stage1Ref.current as never,
        manualAnswers: next,
        source: MANUAL_SOURCE,
        confidence: MANUAL_CONFIDENCE_LABEL,
        updatedAt: new Date().toISOString(),
      };
      saveReadinessLocal(local);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fromUrl = resumeTokenFromUrl();
        const local = loadReadinessLocal();
        let sessionToken = fromUrl || local?.token || null;
        let restored = emptyManualAnswers();
        if (local?.manualAnswers) {
          restored = { ...restored, ...local.manualAnswers };
        }

        if (sessionToken) {
          try {
            const remote = await getReadinessSession(sessionToken);
            if (cancelled) return;
            sessionToken = remote.token;
            const fromDraft = manualAnswersFromDraft(remote.draft || {});
            if (fromDraft) restored = { ...restored, ...fromDraft };
            const s1 = stage1FromDraft(remote.draft || {}) as Record<string, unknown>;
            stage1Ref.current = s1;
            setStage1(s1);
          } catch {
            sessionToken = null;
          }
        }

        if (!sessionToken) {
          const created = await createReadinessSession({
            stage: "manual",
            draft: { manualAnswers: restored, source: MANUAL_SOURCE },
          });
          if (cancelled) return;
          sessionToken = created.token;
        }

        if (cancelled) return;
        setToken(sessionToken);
        setAnswers(restored);
        persistLocal(restored, sessionToken, "manual");
        setStatus("form");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Could not load questionnaire.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistLocal]);

  const complete = useMemo(() => isManualQuestionnaireComplete(answers), [answers]);

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      persistLocal(next, token, "manual");
      return next;
    });
  };

  const onBlurPersist = async () => {
    if (!token) return;
    try {
      await patchReadinessSession(token, {
        stage: "manual",
        draft: {
          stage1,
          manualAnswers: answers,
          source: MANUAL_SOURCE,
          confidence: MANUAL_CONFIDENCE_LABEL,
        },
      });
    } catch {
      // local still holds draft
    }
  };

  const onSubmit = async () => {
    if (!token || !complete || status === "submitting") return;
    setStatus("submitting");
    setErrorMessage("");
    try {
      const draft = buildManualSessionDraft(answers, { stage1 });
      // Ensure source/confidence are top-level on the session draft for API verification.
      const sessionDraft: Record<string, unknown> = {
        ...draft,
        source: MANUAL_SOURCE,
        confidence: MANUAL_CONFIDENCE_LABEL,
      };
      const updated = await patchReadinessSession(token, {
        stage: "manual_submitted",
        draft: sessionDraft,
      });
      persistLocal(answers, token, "manual_submitted");
      const src = typeof updated.draft?.source === "string" ? updated.draft.source : MANUAL_SOURCE;
      const conf =
        typeof updated.draft?.confidence === "string"
          ? updated.draft.confidence
          : MANUAL_CONFIDENCE_LABEL;
      setSavedMeta({ source: src, confidence: conf });
      // Stage 5: gate before scored results (manual → ranges on snapshot).
      setStatus("gate");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save answers.");
      setStatus("form");
    }
  };

  const onScored = (result: ScoreResponse) => {
    const path =
      result.snapshotPath || `/readiness/snapshot?id=${encodeURIComponent(result.snapshotId)}`;
    if (typeof window !== "undefined") {
      window.location.assign(path);
    }
  };

  if (status === "loading") {
    return (
      <div className="card mt-8" aria-busy="true" data-testid="manual-questionnaire-loading">
        <p className="text-sm text-muted">Loading questionnaire…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card mt-8 border-red/30" role="alert">
        <p className="font-semibold text-ink">Could not load the questionnaire.</p>
        <p className="mt-2 text-sm text-muted">{errorMessage}</p>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (status === "gate" && token) {
    return (
      <div data-testid="manual-questionnaire-gate">
        <p className="sr-only" data-testid="manual-source">
          {savedMeta?.source ?? MANUAL_SOURCE}
        </p>
        <ScoreGateForm token={token} source={MANUAL_SOURCE} onScored={onScored} />
      </div>
    );
  }

  if (status === "done") {
    const resumeHref = token ? `/readiness?token=${encodeURIComponent(token)}` : "/readiness";
    return (
      <div className="card mt-8" data-testid="manual-questionnaire-done">
        <h2 className="font-display text-2xl font-bold text-ink">{c.successTitle}</h2>
        <p className="mt-3 text-ink-soft">{c.successBody}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">source</dt>
            <dd className="font-mono font-semibold text-ink" data-testid="manual-source">
              {savedMeta?.source ?? MANUAL_SOURCE}
            </dd>
          </div>
          <div>
            <dt className="text-muted">confidence</dt>
            <dd className="font-mono font-semibold text-ink" data-testid="manual-confidence">
              {savedMeta?.confidence ?? MANUAL_CONFIDENCE_LABEL}
            </dd>
          </div>
        </dl>
        {token ? (
          <p className="mt-4 break-all text-xs text-muted" data-testid="manual-resume-token">
            Resume token: {token}
          </p>
        ) : null}
        <Link href={resumeHref} className="btn-primary mt-6 inline-flex">
          {c.continueToReadiness}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8" data-testid="manual-questionnaire">
      <div className="space-y-6">
        {MANUAL_QUESTIONNAIRE.map((q, index) => (
          <fieldset key={q.id} className="card" data-testid={`manual-q-${q.id}`}>
            <legend className="font-display text-lg font-semibold text-ink">
              <span className="mr-2 text-sm font-medium text-muted">{index + 1}.</span>
              {q.label}
              {q.required ? (
                <span className="sr-only"> (required)</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-muted">optional</span>
              )}
            </legend>
            {q.helper ? <p className="mt-1 text-sm text-muted">{q.helper}</p> : null}

            {q.type === "single" && q.options ? (
              <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={q.label}>
                {q.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
                      answers[q.id] === opt
                        ? "border-purple bg-purple-soft/40"
                        : "border-border bg-surface hover:border-purple/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => {
                        setAnswer(q.id, opt);
                        void onBlurPersist();
                      }}
                      className="mt-0.5"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                name={q.id}
                rows={q.id === "summary" || q.id === "concerns" ? 3 : 2}
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                onChange={(ev) => setAnswer(q.id, ev.target.value.slice(0, 2000))}
                onBlur={() => void onBlurPersist()}
                placeholder={q.placeholder}
                className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
                data-testid={`manual-input-${q.id}`}
              />
            )}
          </fieldset>
        ))}
      </div>

      {errorMessage ? (
        <p className="mt-4 text-sm text-red" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={!complete || status === "submitting"}
          onClick={() => void onSubmit()}
          data-testid="manual-submit"
        >
          {status === "submitting" ? c.submitting : c.submit}
        </button>
        <Link
          href={token ? `/readiness?token=${encodeURIComponent(token)}` : "/readiness"}
          className="text-sm font-semibold text-purple hover:text-purple-dark"
          data-testid="readiness-fallback-back"
        >
          ← {c.back}
        </Link>
      </div>
    </div>
  );
}
