"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { waitlistContent } from "@/content/waitlist";

type FormState = {
  fullName: string;
  workEmail: string;
  companyName: string;
  productUrl: string;
  role: string;
  stage: string;
  blocker: string;
  startWindow: string;
  description: string;
  stack: string;
  budget: string;
  enterpriseDeadline: boolean;
  privacyAccepted: boolean;
  marketingConsent: boolean;
};

const initial: FormState = {
  fullName: "",
  workEmail: "",
  companyName: "",
  productUrl: "",
  role: "",
  stage: "",
  blocker: "",
  startWindow: "",
  description: "",
  stack: "",
  budget: "",
  enterpriseDeadline: false,
  privacyAccepted: false,
  marketingConsent: false,
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function WaitlistForm() {
  const router = useRouter();
  const { form } = waitlistContent;
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-sm focus-visible:border-purple";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const step1Valid = useMemo(() => {
    return (
      values.fullName.trim().length > 1 &&
      isEmail(values.workEmail.trim()) &&
      values.companyName.trim().length > 1 &&
      values.productUrl.trim().length > 3
    );
  }, [values]);

  const validateStep1 = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (values.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!isEmail(values.workEmail.trim())) next.workEmail = "Enter a valid work email.";
    if (values.companyName.trim().length < 2) next.companyName = "Enter your company name.";
    if (values.productUrl.trim().length < 4) next.productUrl = "Enter a product or company URL.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateStep2 = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!values.stage) next.stage = "Select a stage.";
    if (!values.blocker) next.blocker = "Select a primary blocker.";
    if (!values.startWindow) next.startWindow = "Select a start window.";
    if (values.description.trim().length < 10) {
      next.description = "Add a short description (at least a sentence).";
    }
    if (!values.privacyAccepted) {
      next.privacyAccepted = "Privacy acceptance is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onContinue = () => {
    if (validateStep1()) {
      setStep(2);
      setStatusMessage("");
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateStep2()) return;

    setStatus("submitting");
    setStatusMessage("Submitting your application…");

    // API integration lands in a later mission. For this frontend mission,
    // validated applications proceed to the thank-you confirmation route.
    await new Promise((resolve) => setTimeout(resolve, 250));
    router.push("/thank-you");
  };

  return (
    <form className="card" onSubmit={onSubmit} noValidate aria-describedby="waitlist-status">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <span
          className={`rounded-full px-3 py-1 font-semibold ${step === 1 ? "bg-purple text-white" : "bg-purple-soft text-purple-dark"}`}
        >
          1. {form.step1Title}
        </span>
        <span
          className={`rounded-full px-3 py-1 font-semibold ${step === 2 ? "bg-purple text-white" : "bg-canvas text-muted"}`}
        >
          2. {form.step2Title}
        </span>
      </div>

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label htmlFor="fullName" className="text-sm font-medium text-ink">
              Full name <span className="text-red">*</span>
            </label>
            <input
              id="fullName"
              name="fullName"
              autoComplete="name"
              className={fieldClass}
              value={values.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              required
            />
            {errors.fullName ? (
              <p id="fullName-error" className="mt-1 text-xs text-red">
                {errors.fullName}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="workEmail" className="text-sm font-medium text-ink">
              Work email <span className="text-red">*</span>
            </label>
            <input
              id="workEmail"
              name="workEmail"
              type="email"
              autoComplete="email"
              className={fieldClass}
              value={values.workEmail}
              onChange={(e) => update("workEmail", e.target.value)}
              aria-invalid={Boolean(errors.workEmail)}
              aria-describedby={errors.workEmail ? "workEmail-error" : undefined}
              required
            />
            {errors.workEmail ? (
              <p id="workEmail-error" className="mt-1 text-xs text-red">
                {errors.workEmail}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="companyName" className="text-sm font-medium text-ink">
              Company name <span className="text-red">*</span>
            </label>
            <input
              id="companyName"
              name="companyName"
              autoComplete="organization"
              className={fieldClass}
              value={values.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              aria-invalid={Boolean(errors.companyName)}
              required
            />
            {errors.companyName ? (
              <p className="mt-1 text-xs text-red">{errors.companyName}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="productUrl" className="text-sm font-medium text-ink">
              Product or company URL <span className="text-red">*</span>
            </label>
            <input
              id="productUrl"
              name="productUrl"
              type="url"
              autoComplete="url"
              placeholder="https://"
              className={fieldClass}
              value={values.productUrl}
              onChange={(e) => update("productUrl", e.target.value)}
              aria-invalid={Boolean(errors.productUrl)}
              required
            />
            {errors.productUrl ? (
              <p className="mt-1 text-xs text-red">{errors.productUrl}</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="role" className="text-sm font-medium text-ink">
              Role / title <span className="text-muted">(optional)</span>
            </label>
            <input
              id="role"
              name="role"
              autoComplete="organization-title"
              className={fieldClass}
              value={values.role}
              onChange={(e) => update("role", e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <label htmlFor="stage" className="text-sm font-medium text-ink">
              Current stage <span className="text-red">*</span>
            </label>
            <select
              id="stage"
              name="stage"
              className={fieldClass}
              value={values.stage}
              onChange={(e) => update("stage", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {form.stages.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errors.stage ? <p className="mt-1 text-xs text-red">{errors.stage}</p> : null}
          </div>

          <div>
            <label htmlFor="blocker" className="text-sm font-medium text-ink">
              Primary blocker <span className="text-red">*</span>
            </label>
            <select
              id="blocker"
              name="blocker"
              className={fieldClass}
              value={values.blocker}
              onChange={(e) => update("blocker", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {form.blockers.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errors.blocker ? <p className="mt-1 text-xs text-red">{errors.blocker}</p> : null}
          </div>

          <div>
            <label htmlFor="startWindow" className="text-sm font-medium text-ink">
              Desired start window <span className="text-red">*</span>
            </label>
            <select
              id="startWindow"
              name="startWindow"
              className={fieldClass}
              value={values.startWindow}
              onChange={(e) => update("startWindow", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {form.startWindows.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errors.startWindow ? (
              <p className="mt-1 text-xs text-red">{errors.startWindow}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="description" className="text-sm font-medium text-ink">
              Short description <span className="text-red">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className={fieldClass}
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              required
            />
            {errors.description ? (
              <p className="mt-1 text-xs text-red">{errors.description}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="stack" className="text-sm font-medium text-ink">
                Build tool / stack <span className="text-muted">(optional)</span>
              </label>
              <input
                id="stack"
                name="stack"
                className={fieldClass}
                value={values.stack}
                onChange={(e) => update("stack", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="budget" className="text-sm font-medium text-ink">
                Budget range <span className="text-muted">(optional)</span>
              </label>
              <select
                id="budget"
                name="budget"
                className={fieldClass}
                value={values.budget}
                onChange={(e) => update("budget", e.target.value)}
              >
                <option value="">Select…</option>
                {form.budgets.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.enterpriseDeadline}
              onChange={(e) => update("enterpriseDeadline", e.target.checked)}
            />
            An enterprise or customer deadline is involved
          </label>

          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.privacyAccepted}
              onChange={(e) => update("privacyAccepted", e.target.checked)}
              required
            />
            <span>
              I accept the{" "}
              <a href="/privacy" className="font-semibold text-purple underline">
                privacy notice
              </a>{" "}
              for application processing. <span className="text-red">*</span>
            </span>
          </label>
          {errors.privacyAccepted ? (
            <p className="text-xs text-red">{errors.privacyAccepted}</p>
          ) : null}

          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.marketingConsent}
              onChange={(e) => update("marketingConsent", e.target.checked)}
            />
            Send me optional product and capacity updates (separate from application processing)
          </label>
        </div>
      )}

      <div
        id="waitlist-status"
        className="mt-4 text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        {statusMessage}
        {status === "error" ? <span className="text-red"> {statusMessage}</span> : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {step === 2 ? (
          <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
            {form.backLabel}
          </button>
        ) : null}

        {step === 1 ? (
          <button
            type="button"
            className="btn-primary"
            onClick={onContinue}
            disabled={!step1Valid && Object.keys(errors).length > 0}
          >
            {form.continueLabel}
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={status === "submitting"}>
            {status === "submitting" ? "Submitting…" : form.submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}
