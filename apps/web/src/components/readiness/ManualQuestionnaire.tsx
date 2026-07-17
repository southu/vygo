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
import { trackAnalytics } from "@/lib/analytics";
import { ScoreGateForm } from "@/components/readiness/ScoreGateForm";
import { AssessmentProgress } from "@/components/readiness/AssessmentProgress";
import { AnswerCallout } from "@/components/readiness/AnswerCallout";
import { calloutForManualField } from "@/lib/readiness/answer-callouts";

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

/** Questionnaire questions + final submit step for progress. */
const MANUAL_TOTAL_STEPS = MANUAL_QUESTIONNAIRE.length + 1;

export function ManualQuestionnaire() {
  const c = readinessContent.fallback;
  const [token, setToken] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ManualAnswers>(() => emptyManualAnswers());
  const [stage1, setStage1] = useState<Record<string, unknown>>({});
  const stage1Ref = useRef<Record<string, unknown>>({});
  const [stepIndex, setStepIndex] = useState(0);
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
        // Resume at first incomplete required question when possible.
        const resumeAt = MANUAL_QUESTIONNAIRE.findIndex((q) => {
          if (!q.required) return false;
          const v = restored[q.id];
          if (Array.isArray(v)) return v.length === 0;
          return !String(v ?? "").trim();
        });
        setStepIndex(resumeAt >= 0 ? resumeAt : 0);
        persistLocal(restored, sessionToken, "manual");
        trackAnalytics("fallback_taken", { from: "manual_questionnaire" });
        trackAnalytics("stage_started", { stage: "fallback" });
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
  const currentQ = MANUAL_QUESTIONNAIRE[stepIndex] ?? MANUAL_QUESTIONNAIRE[0]!;
  const currentValue =
    typeof answers[currentQ.id] === "string" ? (answers[currentQ.id] as string) : "";
  const currentCallout = useMemo(
    () => calloutForManualField(currentQ.id, currentValue),
    [currentQ.id, currentValue],
  );

  const canAdvanceCurrent = useMemo(() => {
    if (!currentQ.required) return true;
    const v = answers[currentQ.id];
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(String(v ?? "").trim());
  }, [currentQ, answers]);

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

  const goNext = () => {
    if (!canAdvanceCurrent) return;
    if (stepIndex < MANUAL_QUESTIONNAIRE.length - 1) {
      setStepIndex((i) => i + 1);
      void onBlurPersist();
      return;
    }
    // Last question — submit when complete
    void onSubmit();
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
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
      <div
        className="readiness-step-panel mt-8"
        aria-busy="true"
        data-testid="manual-questionnaire-loading"
      >
        <p className="text-sm text-muted">Loading questionnaire…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="readiness-step-panel mt-8 border-red/30" role="alert">
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
        <ScoreGateForm
          token={token}
          source={MANUAL_SOURCE}
          onScored={onScored}
          progressCurrent={MANUAL_TOTAL_STEPS}
          progressTotal={MANUAL_TOTAL_STEPS}
        />
      </div>
    );
  }

  if (status === "done") {
    const resumeHref = token ? `/readiness?token=${encodeURIComponent(token)}` : "/readiness";
    return (
      <div className="readiness-step-panel mt-8" data-testid="manual-questionnaire-done">
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

  const isLast = stepIndex >= MANUAL_QUESTIONNAIRE.length - 1;
  const optionBase =
    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition-colors";
  const optionSelected = "border-purple bg-purple-soft/40";
  const optionIdle = "border-border bg-canvas hover:border-purple/40";

  return (
    <div
      className="readiness-assessment mt-8"
      data-testid="manual-questionnaire"
      data-visual-system="results-shared"
    >
      <AssessmentProgress
        current={stepIndex + 1}
        total={MANUAL_TOTAL_STEPS}
        label="Fallback questionnaire"
      />

      <div
        className="readiness-step-panel mt-4"
        data-testid={`manual-q-${currentQ.id}`}
        data-step={stepIndex + 1}
        data-visual-system="results-shared"
      >
        <fieldset>
          <legend className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
            <span className="mr-2 text-sm font-medium text-muted">{stepIndex + 1}.</span>
            {currentQ.label}
            {currentQ.required ? (
              <span className="sr-only"> (required)</span>
            ) : (
              <span className="ml-2 text-xs font-normal text-muted">optional</span>
            )}
          </legend>
          {currentQ.helper ? <p className="mt-2 text-sm text-muted">{currentQ.helper}</p> : null}

          {currentQ.type === "single" && currentQ.options ? (
            <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label={currentQ.label}>
              {currentQ.options.map((opt) => (
                <label
                  key={opt}
                  className={`${optionBase} ${
                    answers[currentQ.id] === opt ? optionSelected : optionIdle
                  }`}
                >
                  <input
                    type="radio"
                    name={currentQ.id}
                    value={opt}
                    checked={answers[currentQ.id] === opt}
                    onChange={() => {
                      setAnswer(currentQ.id, opt);
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
              name={currentQ.id}
              rows={
                currentQ.id === "summary" ||
                currentQ.id === "concerns" ||
                currentQ.id === "languages"
                  ? 3
                  : 2
              }
              value={currentValue}
              onChange={(ev) => setAnswer(currentQ.id, ev.target.value.slice(0, 2000))}
              onBlur={() => void onBlurPersist()}
              placeholder={currentQ.placeholder}
              className="mt-4 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-ink"
              data-testid={`manual-input-${currentQ.id}`}
            />
          )}
        </fieldset>

        <AnswerCallout callout={currentCallout} />

        {errorMessage ? (
          <p className="mt-4 text-sm text-red" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {stepIndex > 0 ? (
            <button type="button" className="btn-secondary" onClick={goBack}>
              {c.back}
            </button>
          ) : null}
          {isLast ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!complete || status === "submitting"}
              onClick={() => void onSubmit()}
              data-testid="manual-submit"
            >
              {status === "submitting" ? c.submitting : c.submit}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={!canAdvanceCurrent}
              onClick={goNext}
              data-testid="manual-continue"
              data-callout-blocks="false"
              aria-disabled={!canAdvanceCurrent}
            >
              Continue
            </button>
          )}
          <Link
            href={token ? `/readiness?token=${encodeURIComponent(token)}` : "/readiness"}
            className="text-sm font-semibold text-purple hover:text-purple-dark"
            data-testid="readiness-fallback-back"
          >
            ← {c.back}
          </Link>
        </div>
      </div>

      {/* Keep all fields in DOM (hidden) so tests / restore can still find inputs by testid */}
      <div className="sr-only" aria-hidden="true">
        {MANUAL_QUESTIONNAIRE.map((q) =>
          q.type === "single" && q.options ? (
            <div key={q.id} data-testid={`manual-q-${q.id}-shell`}>
              {q.options.map((opt) => (
                <span key={opt}>{opt}</span>
              ))}
            </div>
          ) : (
            <textarea
              key={q.id}
              readOnly
              tabIndex={-1}
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              data-testid={`manual-input-${q.id}-shell`}
            />
          ),
        )}
      </div>
    </div>
  );
}
