"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackAnalytics } from "@/lib/analytics";
import {
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingOutcome,
} from "@/lib/onboarding/state";

type Step = {
  key: string;
  title: string;
  body: string;
  points: string[];
};

const STEPS: readonly Step[] = [
  {
    key: "welcome",
    title: "Welcome to Vygo",
    body: "Vygo turns a stated goal into live-verified, deployed software. This quick tour shows the three things worth knowing before you start.",
    points: [
      "Every change is verified against the live app, not just locally.",
      "Progress is honest: iterations, cost, and elapsed time are all shown.",
    ],
  },
  {
    key: "readiness",
    title: "Run a readiness check",
    body: "The Readiness Check scores how prepared your product idea is and hands you concrete next steps — no account required to try it.",
    points: [
      "Answer a short, structured set of questions.",
      "Get a bucketed score and a tailored action list.",
    ],
  },
  {
    key: "preferences",
    title: "Set your preferences",
    body: "Head to Settings to choose how you hear from us and to opt in or out of privacy-safe usage analytics. You can change these anytime.",
    points: [
      "Control product-update and follow-up emails.",
      "Pick your appearance and digest cadence.",
    ],
  },
];

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState<OnboardingOutcome | null>(null);

  useEffect(() => {
    const prior = loadOnboardingState();
    if (prior.done && prior.outcome) {
      setFinished(prior.outcome);
    }
    trackAnalytics("onboarding_view");
  }, []);

  const total = STEPS.length;
  const isLast = step === total - 1;

  function persist(outcome: OnboardingOutcome, lastStep: number) {
    saveOnboardingState({ done: true, outcome, lastStep });
  }

  function next() {
    trackAnalytics("onboarding_step_completed", { step: step + 1, step_key: STEPS[step]?.key });
    if (isLast) {
      setFinished("completed");
      persist("completed", step);
      trackAnalytics("onboarding_completed", { steps: total });
      return;
    }
    setStep((current) => Math.min(current + 1, total - 1));
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function skip() {
    setFinished("skipped");
    persist("skipped", step);
    trackAnalytics("onboarding_skipped", { step: step + 1 });
  }

  if (finished) {
    return (
      <div className="card" data-testid="onboarding-complete" data-outcome={finished}>
        <p className="eyebrow">{finished === "completed" ? "All set" : "Tour skipped"}</p>
        <h2 className="mt-3 font-display text-2xl font-bold">
          {finished === "completed" ? "You're ready to go" : "No problem — you're all set"}
        </h2>
        <p className="mt-4 text-muted">
          {finished === "completed"
            ? "That's the tour. Jump into a readiness check or head back to the home page whenever you're ready."
            : "You can revisit this tour anytime. Pick up wherever makes sense for you."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/readiness"
            className="btn-primary"
            data-testid="onboarding-primary-cta"
            onClick={() => trackAnalytics("onboarding_cta_clicked", { target: "readiness" })}
          >
            Start a readiness check
          </Link>
          <Link
            href="/"
            className="btn-secondary"
            onClick={() => trackAnalytics("onboarding_cta_clicked", { target: "home" })}
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  const progress = Math.round(((step + 1) / total) * 100);

  if (!current) return null;

  return (
    <div className="card" data-testid="onboarding-flow" data-step={step + 1}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          Step {step + 1} of {total}
        </p>
        <button
          type="button"
          onClick={skip}
          className="text-sm font-semibold text-ink-soft underline-offset-4 hover:text-purple hover:underline"
          data-testid="onboarding-skip"
        >
          Skip
        </button>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-purple-soft"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding progress"
        data-testid="onboarding-progress"
      >
        <div
          className="h-full rounded-full bg-purple transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <h2 className="mt-6 font-display text-2xl font-bold">{current.title}</h2>
      <p className="mt-3 text-muted">{current.body}</p>
      <ul className="mt-4 space-y-2 text-sm text-ink-soft">
        {current.points.map((point) => (
          <li key={point}>• {point}</li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="btn-secondary"
            data-testid="onboarding-back"
          >
            Back
          </button>
        ) : null}
        <button type="button" onClick={next} className="btn-primary" data-testid="onboarding-next">
          {isLast ? "Finish" : "Continue"}
        </button>
      </div>
    </div>
  );
}
