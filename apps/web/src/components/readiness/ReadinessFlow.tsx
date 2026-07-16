"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  BLOCKER_OPTIONS,
  BUILT_WITH_OPTIONS,
  DEADLINE_OPTIONS,
  EMPTY_STAGE1,
  MAX_BLOCKERS,
  PRODUCT_DESCRIPTION_MAX,
  READINESS_PROMPT_REASSURANCE,
  WHO_USES_OPTIONS,
  buildDiagnosticPrompt,
  buildPromptHowTo,
  deadlineNeedsDetail,
  isFeaturesOnlySoftOffRamp,
  isNotBuiltYet,
  type BlockerOption,
  type BuiltWithOption,
  type DeadlineOption,
  type ReadinessStage1Answers,
  type WhoUsesOption,
} from "@vygo/validation";
import { readinessContent } from "@/content/readiness";
import {
  createReadinessSession,
  draftFromStage1,
  emailReadinessPrompt,
  getReadinessSession,
  logReadinessLead,
  patchReadinessSession,
  stage1FromDraft,
} from "@/lib/readiness/api";
import {
  loadReadinessLocal,
  saveReadinessLocal,
  type ReadinessLocalState,
} from "@/lib/readiness/storage";

type View =
  | "loading"
  | "stage1"
  | "off_ramp_not_built"
  | "off_ramp_features"
  | "stage2"
  | "error";

const STAGE1_STEPS = [
  "productDescription",
  "whoUses",
  "builtWith",
  "blockers",
  "deadline",
] as const;
type Stage1Step = (typeof STAGE1_STEPS)[number];

function mergeStage1(partial: Partial<ReadinessStage1Answers>): ReadinessStage1Answers {
  return {
    productDescription: partial.productDescription ?? "",
    whoUses: (partial.whoUses as WhoUsesOption | "") ?? "",
    builtWith: (partial.builtWith as BuiltWithOption | "") ?? "",
    blockers: Array.isArray(partial.blockers) ? [...partial.blockers] : [],
    deadline: (partial.deadline as DeadlineOption | "") ?? "",
    deadlineDetail: partial.deadlineDetail ?? "",
  };
}

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

export function ReadinessFlow() {
  const c = readinessContent;
  const [view, setView] = useState<View>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [stage1, setStage1] = useState<ReadinessStage1Answers>(EMPTY_STAGE1);
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [emailFeedback, setEmailFeedback] = useState("");

  const step: Stage1Step = STAGE1_STEPS[stepIndex] ?? "productDescription";

  const persist = useCallback(
    async (
      nextStage1: ReadinessStage1Answers,
      stage: string,
      extraDraft?: Record<string, unknown>,
      sessionToken?: string | null,
    ) => {
      const t = sessionToken ?? token;
      const draft = draftFromStage1(nextStage1, {
        email: email || undefined,
        ...extraDraft,
      });
      const local: ReadinessLocalState = {
        token: t,
        stage,
        stage1: nextStage1,
        email: email || undefined,
        updatedAt: new Date().toISOString(),
      };
      saveReadinessLocal(local);
      if (!t) return;
      try {
        await patchReadinessSession(t, { stage, draft });
      } catch {
        // Local persist still works; server retry on next action.
      }
    },
    [token, email],
  );

  // Bootstrap: resume from ?token= or localStorage, else create session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fromUrl = resumeTokenFromUrl();
        const local = loadReadinessLocal();
        let sessionToken = fromUrl || local?.token || null;
        let restoredStage1 = mergeStage1(local?.stage1 ?? {});
        let restoredStage = local?.stage || "intake";
        let restoredEmail = local?.email || "";

        if (sessionToken) {
          try {
            const remote = await getReadinessSession(sessionToken);
            if (cancelled) return;
            sessionToken = remote.token;
            restoredStage = remote.stage || restoredStage;
            restoredStage1 = mergeStage1({
              ...restoredStage1,
              ...stage1FromDraft(remote.draft || {}),
            });
            if (typeof remote.draft?.email === "string") {
              restoredEmail = remote.draft.email;
            }
            const off = remote.draft?.offRamp as { kind?: string } | undefined;
            if (off?.kind === "not_built_yet" || isNotBuiltYet(restoredStage1.builtWith)) {
              setToken(sessionToken);
              setStage1(restoredStage1);
              setEmail(restoredEmail);
              setView("off_ramp_not_built");
              return;
            }
          } catch {
            // Stale token — create fresh.
            sessionToken = null;
          }
        }

        if (!sessionToken) {
          const created = await createReadinessSession({
            stage: "intake",
            draft: draftFromStage1(restoredStage1),
          });
          if (cancelled) return;
          sessionToken = created.token;
        }

        if (cancelled) return;
        setToken(sessionToken);
        setStage1(restoredStage1);
        setEmail(restoredEmail);
        saveReadinessLocal({
          token: sessionToken,
          stage: restoredStage,
          stage1: restoredStage1,
          email: restoredEmail || undefined,
          updatedAt: new Date().toISOString(),
        });

        // Resume stage 2 if intake complete.
        if (
          restoredStage === "prompt" ||
          restoredStage === "stage2" ||
          (restoredStage1.productDescription &&
            restoredStage1.whoUses &&
            restoredStage1.builtWith &&
            restoredStage1.blockers?.length &&
            restoredStage1.deadline &&
            !isNotBuiltYet(restoredStage1.builtWith) &&
            !isFeaturesOnlySoftOffRamp(restoredStage1.blockers ?? []))
        ) {
          if (
            restoredStage1.builtWith &&
            !isNotBuiltYet(restoredStage1.builtWith) &&
            restoredStage1.productDescription &&
            restoredStage1.whoUses &&
            restoredStage1.deadline
          ) {
            if (
              isFeaturesOnlySoftOffRamp(restoredStage1.blockers ?? []) &&
              restoredStage !== "prompt" &&
              restoredStage !== "stage2"
            ) {
              setView("off_ramp_features");
              return;
            }
            setView("stage2");
            return;
          }
        }
        setView("stage1");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
        setView("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const promptBundle = useMemo(() => {
    if (!stage1.builtWith || isNotBuiltYet(stage1.builtWith)) return null;
    return buildDiagnosticPrompt({ answers: stage1 });
  }, [stage1]);

  const howTo = useMemo(() => {
    if (!stage1.builtWith) return null;
    return buildPromptHowTo(stage1.builtWith);
  }, [stage1.builtWith]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case "productDescription":
        return stage1.productDescription.trim().length > 0;
      case "whoUses":
        return Boolean(stage1.whoUses);
      case "builtWith":
        return Boolean(stage1.builtWith);
      case "blockers":
        return stage1.blockers.length >= 1 && stage1.blockers.length <= MAX_BLOCKERS;
      case "deadline":
        return Boolean(stage1.deadline);
      default:
        return false;
    }
  }, [step, stage1]);

  const onSelectBuiltWith = async (value: BuiltWithOption) => {
    const next = { ...stage1, builtWith: value };
    setStage1(next);
    if (isNotBuiltYet(value)) {
      await persist(next, "off_ramp_not_built", {
        offRamp: { kind: "not_built_yet", loggedAt: new Date().toISOString() },
      });
      try {
        await logReadinessLead({
          token,
          reason: "not_built_yet",
          answers: next,
        });
      } catch {
        // still show off-ramp
      }
      setView("off_ramp_not_built");
      return;
    }
    await persist(next, "intake");
  };

  const toggleBlocker = async (option: BlockerOption) => {
    const has = stage1.blockers.includes(option);
    let blockers: BlockerOption[];
    if (has) {
      blockers = stage1.blockers.filter((b) => b !== option);
    } else {
      if (stage1.blockers.length >= MAX_BLOCKERS) return;
      blockers = [...stage1.blockers, option];
    }
    const next = { ...stage1, blockers };
    setStage1(next);
    await persist(next, "intake");
  };

  const goNext = async () => {
    if (!canAdvance) return;

    if (step === "blockers" && isFeaturesOnlySoftOffRamp(stage1.blockers)) {
      await persist(stage1, "off_ramp_features", {
        offRamp: { kind: "features_only", loggedAt: new Date().toISOString() },
      });
      try {
        await logReadinessLead({
          token,
          reason: "features_only",
          answers: stage1,
        });
      } catch {
        // still show off-ramp
      }
      setView("off_ramp_features");
      return;
    }

    if (stepIndex < STAGE1_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      await persist(stage1, "intake");
      return;
    }

    // Complete stage 1 → stage 2
    await persist(stage1, "prompt");
    setView("stage2");
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const onCopy = async () => {
    if (!promptBundle?.prompt) return;
    try {
      await navigator.clipboard.writeText(promptBundle.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = promptBundle.prompt;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        setCopied(false);
      }
    }
  };

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !promptBundle?.prompt || emailStatus === "sending") return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailStatus("error");
      setEmailFeedback("Enter a valid email address.");
      return;
    }
    setEmailStatus("sending");
    setEmailFeedback("");
    try {
      await emailReadinessPrompt({
        email: trimmed,
        token,
        prompt: promptBundle.prompt,
      });
      setEmailStatus("success");
      setEmailFeedback(c.stage2.emailSuccess);
      await persist(stage1, "prompt", { email: trimmed });
    } catch {
      setEmailStatus("error");
      setEmailFeedback(c.stage2.emailError);
    }
  };

  if (view === "loading") {
    return (
      <div className="card mt-8" aria-busy="true" data-testid="readiness-loading">
        <p className="text-sm text-muted">Loading your readiness check…</p>
      </div>
    );
  }

  if (view === "error") {
    return (
      <div className="card mt-8 border-red/30" role="alert" data-testid="readiness-error">
        <p className="font-semibold text-ink">We could not start the check.</p>
        <p className="mt-2 text-sm text-muted">{errorMessage}</p>
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (view === "off_ramp_not_built") {
    return (
      <div className="card mt-8" data-testid="readiness-off-ramp-not-built">
        <h2 className="font-display text-2xl font-bold text-ink">{c.offRampNotBuilt.title}</h2>
        <p className="mt-4 text-ink-soft">{c.offRampNotBuilt.body}</p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          {c.offRampNotBuilt.cta}
        </Link>
      </div>
    );
  }

  if (view === "off_ramp_features") {
    return (
      <div className="card mt-8" data-testid="readiness-off-ramp-features">
        <h2 className="font-display text-2xl font-bold text-ink">{c.offRampFeatures.title}</h2>
        <p className="mt-4 text-ink-soft">{c.offRampFeatures.body}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="btn-primary"
            data-testid="readiness-features-continue"
            onClick={() => {
              // Return to blockers so they can add a reliability/security concern.
              setStepIndex(STAGE1_STEPS.indexOf("blockers"));
              setView("stage1");
            }}
          >
            {c.offRampFeatures.continueAnyway}
          </button>
          <Link href="/" className="btn-secondary">
            {c.offRampFeatures.stop}
          </Link>
        </div>
      </div>
    );
  }

  if (view === "stage2" && promptBundle && howTo) {
    return (
      <div className="mt-8" data-testid="readiness-stage2" data-variant={promptBundle.variant}>
        <p className="eyebrow">{c.stage2.progressLabel}</p>
        <h2 className="mt-3 font-display text-2xl font-bold text-ink sm:text-3xl">
          {c.stage2.title}
        </h2>

        <div className="card mt-6">
          <h3 className="font-display text-lg font-semibold text-ink">{c.stage2.howToTitle}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            {howTo.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p
            className="mt-4 rounded-lg border border-green/25 bg-green/5 px-3 py-2 text-sm text-ink-soft"
            data-testid="readiness-reassurance"
          >
            {READINESS_PROMPT_REASSURANCE}
          </p>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink-soft">
              Prompt for <span className="font-semibold text-ink">{howTo.toolName}</span>
              {promptBundle.variant === "A" ? " (Variant A)" : " (Variant B)"}
            </p>
            <button
              type="button"
              className={copied ? "btn-secondary" : "btn-primary"}
              onClick={onCopy}
              data-testid="readiness-copy"
              data-copied={copied ? "true" : "false"}
              aria-live="polite"
            >
              {copied ? c.stage2.copied : c.stage2.copy}
            </button>
          </div>
          <pre
            className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-border bg-trust p-4 text-left font-mono text-xs leading-relaxed text-white/90 sm:text-sm"
            data-testid="readiness-prompt-block"
            tabIndex={0}
          >
            {promptBundle.prompt}
          </pre>
        </div>

        <div className="card mt-6" data-testid="readiness-email-panel">
          <h3 className="font-display text-lg font-semibold text-ink">{c.stage2.emailMe}</h3>
          <p className="mt-1 text-sm text-muted">{c.stage2.resumeHint}</p>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={onEmailSubmit}>
            <label className="sr-only" htmlFor="readiness-email">
              Email
            </label>
            <input
              id="readiness-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder={c.stage2.emailPlaceholder}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="min-h-11 w-full flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
              data-testid="readiness-email-input"
            />
            <button
              type="submit"
              className="btn-secondary shrink-0"
              disabled={emailStatus === "sending"}
              data-testid="readiness-email-submit"
            >
              {emailStatus === "sending" ? c.stage2.emailSending : c.stage2.emailSubmit}
            </button>
          </form>
          {emailFeedback ? (
            <p
              className={`mt-3 text-sm ${emailStatus === "success" ? "text-green-dark" : "text-red"}`}
              role="status"
              data-testid="readiness-email-feedback"
              data-status={emailStatus}
            >
              {emailFeedback}
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-sm">
          <Link
            href={c.stage2.cantRunHref}
            className="font-semibold text-purple hover:text-purple-dark"
            data-testid="readiness-cant-run"
          >
            {c.stage2.cantRun}
          </Link>
        </p>
      </div>
    );
  }

  // Stage 1
  const q = c.stage1.questions;
  return (
    <div className="mt-8" data-testid="readiness-stage1" data-step={step}>
      <p className="eyebrow">
        {c.stage1.progressLabel} · {stepIndex + 1}/{STAGE1_STEPS.length}
      </p>

      <div className="card mt-4">
        {step === "productDescription" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold text-ink sm:text-2xl">
              {q.productDescription.label}
            </legend>
            <p className="mt-2 text-sm text-muted">{q.productDescription.helper}</p>
            <textarea
              name="productDescription"
              rows={3}
              maxLength={PRODUCT_DESCRIPTION_MAX}
              value={stage1.productDescription}
              onChange={(ev) => {
                const productDescription = ev.target.value.slice(0, PRODUCT_DESCRIPTION_MAX);
                setStage1((s) => ({ ...s, productDescription }));
              }}
              onBlur={() => void persist(stage1, "intake")}
              placeholder={q.productDescription.placeholder}
              className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
              data-testid="readiness-q1"
            />
            <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
              {stage1.productDescription.length}/{PRODUCT_DESCRIPTION_MAX}
            </p>
          </fieldset>
        ) : null}

        {step === "whoUses" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold text-ink sm:text-2xl">
              {q.whoUses.label}
            </legend>
            <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label={q.whoUses.label}>
              {WHO_USES_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
                    stage1.whoUses === opt
                      ? "border-purple bg-purple-soft/40"
                      : "border-border bg-surface hover:border-purple/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="whoUses"
                    value={opt}
                    checked={stage1.whoUses === opt}
                    onChange={() => {
                      const next = { ...stage1, whoUses: opt };
                      setStage1(next);
                      void persist(next, "intake");
                    }}
                    className="mt-0.5"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === "builtWith" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold text-ink sm:text-2xl">
              {q.builtWith.label}
            </legend>
            <div
              className="mt-4 flex flex-col gap-2"
              role="radiogroup"
              aria-label={q.builtWith.label}
              data-testid="readiness-q3"
            >
              {BUILT_WITH_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
                    stage1.builtWith === opt
                      ? "border-purple bg-purple-soft/40"
                      : "border-border bg-surface hover:border-purple/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="builtWith"
                    value={opt}
                    checked={stage1.builtWith === opt}
                    onChange={() => void onSelectBuiltWith(opt)}
                    className="mt-0.5"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === "blockers" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold text-ink sm:text-2xl">
              {q.blockers.label}
            </legend>
            <p className="mt-2 text-sm text-muted">{q.blockers.helper}</p>
            <div className="mt-4 flex flex-col gap-2" data-testid="readiness-q4">
              {BLOCKER_OPTIONS.map((opt) => {
                const checked = stage1.blockers.includes(opt);
                const disabled = !checked && stage1.blockers.length >= MAX_BLOCKERS;
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
                      checked
                        ? "border-purple bg-purple-soft/40"
                        : disabled
                          ? "cursor-not-allowed border-border bg-surface opacity-50"
                          : "border-border bg-surface hover:border-purple/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="blockers"
                      value={opt}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => void toggleBlocker(opt)}
                      className="mt-0.5"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              {stage1.blockers.length}/{MAX_BLOCKERS} selected
            </p>
          </fieldset>
        ) : null}

        {step === "deadline" ? (
          <fieldset>
            <legend className="font-display text-xl font-bold text-ink sm:text-2xl">
              {q.deadline.label}
            </legend>
            <div
              className="mt-4 flex flex-col gap-2"
              role="radiogroup"
              aria-label={q.deadline.label}
              data-testid="readiness-q5"
            >
              {DEADLINE_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
                    stage1.deadline === opt
                      ? "border-purple bg-purple-soft/40"
                      : "border-border bg-surface hover:border-purple/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="deadline"
                    value={opt}
                    checked={stage1.deadline === opt}
                    onChange={() => {
                      const next = {
                        ...stage1,
                        deadline: opt,
                        deadlineDetail: deadlineNeedsDetail(opt) ? stage1.deadlineDetail : "",
                      };
                      setStage1(next);
                      void persist(next, "intake");
                    }}
                    className="mt-0.5"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {deadlineNeedsDetail(stage1.deadline) ? (
              <div className="mt-4" data-testid="readiness-deadline-detail">
                <label htmlFor="deadlineDetail" className="text-sm font-medium text-ink-soft">
                  {q.deadline.detailLabel}
                </label>
                <input
                  id="deadlineDetail"
                  type="text"
                  name="deadlineDetail"
                  value={stage1.deadlineDetail}
                  onChange={(ev) =>
                    setStage1((s) => ({ ...s, deadlineDetail: ev.target.value.slice(0, 280) }))
                  }
                  onBlur={() => void persist(stage1, "intake")}
                  placeholder={q.deadline.detailPlaceholder}
                  className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
                />
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {stepIndex > 0 ? (
            <button type="button" className="btn-secondary" onClick={goBack}>
              {c.stage1.back}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={!canAdvance}
            onClick={() => void goNext()}
            data-testid="readiness-continue"
          >
            {c.stage1.continue}
          </button>
        </div>
      </div>
    </div>
  );
}
