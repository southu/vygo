"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { waitlistContent } from "@/content/waitlist";

/**
 * Cloudflare official always-pass test sitekey (public).
 * Used when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset so non-prod deploys work.
 * Production must set a real site key via env.
 */
const TURNSTILE_TEST_SITE_KEY = "1x0000000000000000000000000000000AA";

type FormState = {
  fullName: string;
  email: string;
  companyName: string;
  productUrl: string;
  role: string;
  stage: string;
  primaryBlocker: string;
  desiredStartWindow: string;
  message: string;
  prototypePlatform: string;
  budgetRange: string;
  commercialDeadline: boolean;
  privacyAccepted: boolean;
  marketingConsent: boolean;
  /** Honeypot — must stay empty. */
  website: string;
};

const initial: FormState = {
  fullName: "",
  email: "",
  companyName: "",
  productUrl: "",
  role: "",
  stage: "",
  primaryBlocker: "",
  desiredStartWindow: "",
  message: "",
  prototypePlatform: "",
  budgetRange: "",
  commercialDeadline: false,
  privacyAccepted: false,
  marketingConsent: false,
  website: "",
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
};

type ApiSuccessBody = {
  data?: {
    accepted?: boolean;
    message?: string;
  };
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveApiBase(): string {
  // Same-origin under the live reverse proxy (http://127.0.0.1:8380/v1/...).
  // Optional absolute override for local split dev servers.
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv && typeof window !== "undefined") {
    try {
      const envUrl = new URL(fromEnv);
      const pageOrigin = window.location.origin;
      // Prefer same-origin when the page is already the live proxy.
      if (envUrl.origin === pageOrigin) return "";
      // If page is on the proxy port and API env points elsewhere, still use same-origin.
      if (window.location.port === "8380") return "";
      return fromEnv.replace(/\/$/, "");
    } catch {
      return "";
    }
  }
  return "";
}

function resolveTurnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || TURNSTILE_TEST_SITE_KEY;
}

export function WaitlistForm() {
  const router = useRouter();
  const { form } = waitlistContent;
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const formStartedAtRef = useRef<number>(Date.now());
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const siteKey = resolveTurnstileSiteKey();

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-sm focus-visible:border-purple";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  // Load Turnstile script once; render widget when step 2 is shown.
  useEffect(() => {
    formStartedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (step !== 2) return;

    const renderWidget = () => {
      if (!turnstileContainerRef.current || !window.turnstile) return;
      if (turnstileWidgetIdRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // ignore
        }
        turnstileWidgetIdRef.current = null;
      }
      turnstileContainerRef.current.innerHTML = "";
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        "error-callback": () => setTurnstileToken(""),
        "expired-callback": () => setTurnstileToken(""),
        theme: "light",
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (window.turnstile) {
      renderWidget();
      return;
    }
    if (existing) {
      existing.addEventListener("load", renderWidget);
      return () => existing.removeEventListener("load", renderWidget);
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => renderWidget();
    document.head.appendChild(script);
    return () => {
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // ignore
        }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [step, siteKey]);

  const step1Valid = useMemo(() => {
    return (
      values.fullName.trim().length > 1 &&
      isEmail(values.email.trim()) &&
      values.companyName.trim().length > 1 &&
      values.productUrl.trim().length > 3
    );
  }, [values]);

  const validateStep1 = () => {
    const next: Partial<Record<string, string>> = {};
    if (values.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!isEmail(values.email.trim())) next.email = "Enter a valid work email.";
    if (values.companyName.trim().length < 2) next.companyName = "Enter your company name.";
    if (values.productUrl.trim().length < 4) next.productUrl = "Enter a product or company URL.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateStep2 = () => {
    const next: Partial<Record<string, string>> = {};
    if (!values.stage) next.stage = "Select a stage.";
    if (!values.primaryBlocker) next.primaryBlocker = "Select a primary blocker.";
    if (!values.desiredStartWindow) next.desiredStartWindow = "Select a start window.";
    if (values.message.trim().length < 10) {
      next.message = "Add a short description (at least a sentence).";
    }
    if (!values.privacyAccepted) {
      next.privacyAccepted = "Privacy acceptance is required.";
    }
    if (!turnstileToken) {
      next.turnstileToken = "Please complete the verification challenge.";
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

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {
        // ignore
      }
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateStep2()) return;

    setStatus("submitting");
    setStatusMessage("Submitting your application…");
    setErrors({});

    const utmParams =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const utm = {
      source: utmParams?.get("utm_source") || null,
      medium: utmParams?.get("utm_medium") || null,
      campaign: utmParams?.get("utm_campaign") || null,
      content: utmParams?.get("utm_content") || null,
      term: utmParams?.get("utm_term") || null,
    };

    const payload: Record<string, unknown> = {
      fullName: values.fullName,
      email: values.email,
      companyName: values.companyName,
      productUrl: values.productUrl,
      role: values.role.trim() || null,
      stage: values.stage,
      primaryBlocker: values.primaryBlocker,
      desiredStartWindow: values.desiredStartWindow,
      message: values.message,
      prototypePlatform: values.prototypePlatform.trim() || null,
      budgetRange: values.budgetRange || null,
      commercialDeadline: values.commercialDeadline,
      privacyAccepted: values.privacyAccepted,
      marketingConsent: values.marketingConsent,
      turnstileToken,
      website: values.website,
      formStartedAt: formStartedAtRef.current,
      landingPage: typeof window !== "undefined" ? window.location.pathname : "/waitlist",
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      utm,
    };

    try {
      const base = resolveApiBase();
      const res = await fetch(`${base}/v1/waitlist`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });

      let body: ApiErrorBody & ApiSuccessBody = {};
      try {
        body = (await res.json()) as ApiErrorBody & ApiSuccessBody;
      } catch {
        body = {};
      }

      if (res.ok && body?.data?.accepted === true) {
        setStatus("idle");
        setStatusMessage(body.data.message || "Your application has been received.");
        router.push("/thank-you");
        return;
      }

      const code = body?.error?.code;
      const message =
        body?.error?.message ||
        (res.status === 429
          ? "Too many attempts. Please try again later or email hello@vygo.ai."
          : "Something went wrong. Please try again.");

      if (body?.error?.fields) {
        setErrors(body.error.fields);
      }

      if (code === "TURNSTILE_FAILED") {
        setErrors((prev) => ({
          ...prev,
          turnstileToken: "Verification failed. Please try again.",
        }));
        resetTurnstile();
      }

      setStatus("error");
      setStatusMessage(message);
    } catch {
      setStatus("error");
      setStatusMessage("Network error. Please check your connection and try again.");
    }
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

      {/* Honeypot — hidden from users, bots may fill it */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => update("website", e.target.value)}
        />
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
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Work email <span className="text-red">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className={fieldClass}
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              required
            />
            {errors.email ? (
              <p id="email-error" className="mt-1 text-xs text-red">
                {errors.email}
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
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.stage ? <p className="mt-1 text-xs text-red">{errors.stage}</p> : null}
          </div>

          <div>
            <label htmlFor="primaryBlocker" className="text-sm font-medium text-ink">
              Primary blocker <span className="text-red">*</span>
            </label>
            <select
              id="primaryBlocker"
              name="primaryBlocker"
              className={fieldClass}
              value={values.primaryBlocker}
              onChange={(e) => update("primaryBlocker", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {form.blockers.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.primaryBlocker ? (
              <p className="mt-1 text-xs text-red">{errors.primaryBlocker}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="desiredStartWindow" className="text-sm font-medium text-ink">
              Desired start window <span className="text-red">*</span>
            </label>
            <select
              id="desiredStartWindow"
              name="desiredStartWindow"
              className={fieldClass}
              value={values.desiredStartWindow}
              onChange={(e) => update("desiredStartWindow", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {form.startWindows.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.desiredStartWindow ? (
              <p className="mt-1 text-xs text-red">{errors.desiredStartWindow}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="message" className="text-sm font-medium text-ink">
              Short description <span className="text-red">*</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              className={fieldClass}
              value={values.message}
              onChange={(e) => update("message", e.target.value)}
              required
            />
            {errors.message ? <p className="mt-1 text-xs text-red">{errors.message}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="prototypePlatform" className="text-sm font-medium text-ink">
                Build tool / stack <span className="text-muted">(optional)</span>
              </label>
              <input
                id="prototypePlatform"
                name="prototypePlatform"
                className={fieldClass}
                value={values.prototypePlatform}
                onChange={(e) => update("prototypePlatform", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="budgetRange" className="text-sm font-medium text-ink">
                Budget range <span className="text-muted">(optional)</span>
              </label>
              <select
                id="budgetRange"
                name="budgetRange"
                className={fieldClass}
                value={values.budgetRange}
                onChange={(e) => update("budgetRange", e.target.value)}
              >
                <option value="">Select…</option>
                {form.budgets.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.commercialDeadline}
              onChange={(e) => update("commercialDeadline", e.target.checked)}
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

          <div>
            <div ref={turnstileContainerRef} className="mt-2" />
            {errors.turnstileToken ? (
              <p className="mt-1 text-xs text-red">{errors.turnstileToken}</p>
            ) : null}
          </div>
        </div>
      )}

      <div
        id="waitlist-status"
        className={`mt-4 text-sm ${status === "error" ? "text-red" : "text-muted"}`}
        role="status"
        aria-live="polite"
      >
        {statusMessage}
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
