"use client";

import { useRef, useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api";
import { APPLY_SUBMIT_TIMEOUT_MS } from "@/lib/apply-submit";
import { formatOpeningDate } from "@/lib/availability";
import { emitConversionEvent, resolveLandingPageId } from "@/lib/campaign/conversion";
import { useAvailability } from "./AvailabilityProvider";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

type FieldErrors = { fullName?: string; workEmail?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ApplySuccessBody = {
  id?: string;
  full_name?: string;
  work_email?: string;
  product_url?: string | null;
  message?: string | null;
  source?: string;
  created_at?: string;
};

type ApplyErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

const SUCCESS_HEADING = "Thank you — your application is in.";
const SUCCESS_BODY =
  "A senior engineer at VYGO reviews every application against available openings, and we'll be in touch within one business day. Keep an eye on your inbox — the note will come from our team at vygo.ai.";

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/**
 * Client-side apply form. Submits to POST /api/apply (server-side only writes to
 * Postgres). On 2xx, replaces the form with an inline thank-you confirmation
 * (no navigation). On non-2xx, network failure, or client timeout, keeps entered
 * values and shows an inline error so the applicant can retry. Disables submit
 * while the request is in flight; re-enables after any failure.
 */
export function ApplyForm() {
  const { data, isBusy } = useAvailability();
  const nextAuditDate = formatOpeningDate(data?.nextOpeningDate ?? null);
  const nextAuditDisplay = nextAuditDate ?? (isBusy ? "Loading…" : "Check back soon");

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [feedback, setFeedback] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Shared conversion contract for this apply attempt. Reuses the same
  // consent-gated, deduped emitter as the waitlist so the /apply form reports
  // form_start / conversion_error / conversion_success through one pipeline.
  const landingPageIdRef = useRef<string>("apply");
  const conversionStartedRef = useRef(false);
  if (typeof window !== "undefined" && landingPageIdRef.current === "apply") {
    landingPageIdRef.current = resolveLandingPageId();
  }

  const emitConversion = (
    event: "form_start" | "conversion_error" | "conversion_success",
    outcome: "started" | "validation_error" | "submission_rejected" | "success",
    extra?: Record<string, string | number | boolean | null>,
    dedupeKey?: string,
  ) => {
    emitConversionEvent({
      event,
      landingPageId: landingPageIdRef.current,
      ctaLocation: null,
      outcome,
      extra,
      dedupeKey,
    });
  };

  // First genuine field interaction (or a submit attempt) = form_start, once.
  const markConversionStart = () => {
    if (conversionStartedRef.current) return;
    conversionStartedRef.current = true;
    emitConversion("form_start", "started", { form_id: "apply" }, "apply");
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = "Enter your full name.";
    if (!workEmail.trim()) next.workEmail = "Enter your work email.";
    else if (!EMAIL_RE.test(workEmail.trim())) next.workEmail = "Enter a valid email address.";
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "submitting") return;

    // A submit attempt always counts as an interaction (keyboard-only paths).
    markConversionStart();

    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      // Accessible client validation failure — never a conversion. Expose the
      // inline errors (aria-invalid + aria-describedby) and move focus.
      setStatus("idle");
      setFeedback("");
      setErrors(fieldErrors);
      emitConversion("conversion_error", "validation_error", {
        form_id: "apply",
        error_fields: Object.keys(fieldErrors).join(","),
        error_count: Object.keys(fieldErrors).length,
      });
      requestAnimationFrame(() => {
        if (errorSummaryRef.current) errorSummaryRef.current.focus();
        else if (fieldErrors.fullName) nameRef.current?.focus();
        else if (fieldErrors.workEmail) emailRef.current?.focus();
      });
      return;
    }

    setErrors({});
    setStatus("submitting");
    setFeedback("");
    setCreatedId(null);

    const payload = {
      full_name: fullName,
      work_email: workEmail,
      product_url: productUrl.trim() || null,
      message: message.trim() || null,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APPLY_SUBMIT_TIMEOUT_MS);

    try {
      const res = await fetch(apiUrl("/api/apply"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        signal: controller.signal,
      });

      let body: ApplySuccessBody & ApplyErrorBody = {};
      try {
        body = (await res.json()) as ApplySuccessBody & ApplyErrorBody;
      } catch {
        body = {};
      }

      // Thank-you only after a confirmed 2xx store response (with application id).
      if (res.ok && typeof body.id === "string") {
        setStatus("success");
        setCreatedId(body.id);
        // Destination-confirmed completion — emitted once per attempt via the
        // durable application id so a retried success never double-counts.
        emitConversion(
          "conversion_success",
          "success",
          { form_id: "apply", status: res.status },
          body.id,
        );
        return;
      }

      const errorMessage =
        body?.error?.message ||
        (res.status >= 400 && res.status < 500
          ? "Please check your details and try again."
          : "Something went wrong. Please try again or email hello@vygo.ai.");
      setStatus("error");
      setFeedback(errorMessage);
      // Rejected destination submission — conversion error, never a success.
      emitConversion("conversion_error", "submission_rejected", {
        form_id: "apply",
        status: res.status,
        code: body?.error?.code ?? "unknown",
      });
    } catch (err) {
      setStatus("error");
      setFeedback(
        isAbortError(err)
          ? "The request timed out. Please try again."
          : "Network error. Please check your connection and try again.",
      );
      emitConversion("conversion_error", "submission_rejected", {
        form_id: "apply",
        code: isAbortError(err) ? "timeout" : "network",
      });
    } finally {
      clearTimeout(timer);
    }
  };

  if (status === "success") {
    return (
      <div className="mt-10">
        <div
          className="rounded-xl border border-purple/30 bg-purple-soft/40 p-5"
          role="status"
          aria-live="polite"
          data-testid="apply-success"
          data-application-id={createdId ?? undefined}
        >
          <h2
            className="font-display text-xl font-bold text-ink sm:text-2xl"
            data-testid="apply-success-heading"
          >
            {SUCCESS_HEADING}
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base" data-testid="apply-success-message">
            {SUCCESS_BODY}
          </p>
          <p className="mt-4 text-sm text-ink-soft" data-testid="apply-success-next-audit-date">
            Next available audit start date:{" "}
            <span className="font-semibold text-ink" data-next-audit-start-date>
              {nextAuditDisplay}
            </span>
          </p>
          {createdId ? (
            <p className="mt-2 text-xs text-ink-soft" data-testid="apply-success-id">
              Reference: {createdId}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const errorEntries = Object.entries(errors).filter(([, msg]) => Boolean(msg));

  return (
    <div className="mt-10">
      <form
        className="space-y-5"
        data-testid="apply-form"
        aria-label="Application form"
        onSubmit={onSubmit}
        onFocusCapture={markConversionStart}
        noValidate
      >
        {errorEntries.length > 0 ? (
          <div
            ref={errorSummaryRef}
            className="rounded-xl border border-red bg-red/5 p-4"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            data-testid="apply-error-summary"
          >
            <p className="text-sm font-semibold text-red">
              There {errorEntries.length === 1 ? "is a problem" : "are problems"} with your
              application
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red">
              {errorEntries.map(([field, msg]) => (
                <li key={field}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <label htmlFor="apply-name" className="block text-sm font-semibold text-ink">
            Full name <span className="text-red">*</span>
          </label>
          <input
            ref={nameRef}
            id="apply-name"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => {
              markConversionStart();
              setFullName(e.target.value);
            }}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
            placeholder="Your name"
            data-testid="apply-full-name"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "apply-name-error" : undefined}
          />
          {errors.fullName ? (
            <p id="apply-name-error" className="mt-1 text-xs text-red" data-field-error="fullName">
              {errors.fullName}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="apply-email" className="block text-sm font-semibold text-ink">
            Work email <span className="text-red">*</span>
          </label>
          <input
            ref={emailRef}
            id="apply-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={workEmail}
            onChange={(e) => {
              markConversionStart();
              setWorkEmail(e.target.value);
            }}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
            placeholder="you@company.com"
            data-testid="apply-work-email"
            aria-invalid={Boolean(errors.workEmail)}
            aria-describedby={errors.workEmail ? "apply-email-error" : undefined}
          />
          {errors.workEmail ? (
            <p
              id="apply-email-error"
              className="mt-1 text-xs text-red"
              data-field-error="workEmail"
            >
              {errors.workEmail}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="apply-product" className="block text-sm font-semibold text-ink">
            Product URL
          </label>
          <input
            id="apply-product"
            name="productUrl"
            type="url"
            value={productUrl}
            onChange={(e) => {
              markConversionStart();
              setProductUrl(e.target.value);
            }}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
            placeholder="https://example.com"
            data-testid="apply-product-url"
          />
        </div>

        <div>
          <label htmlFor="apply-message" className="block text-sm font-semibold text-ink">
            What are you trying to get into production?
          </label>
          <textarea
            id="apply-message"
            name="message"
            rows={4}
            value={message}
            onChange={(e) => {
              markConversionStart();
              setMessage(e.target.value);
            }}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
            placeholder="A few sentences on your product, users, and timeline."
            data-testid="apply-message"
          />
        </div>

        {status === "error" && feedback ? (
          <div
            className="rounded-xl border border-red bg-red/5 p-4 text-sm text-red"
            role="alert"
            aria-live="assertive"
            data-testid="apply-error"
          >
            {feedback}
          </div>
        ) : null}

        <button
          type="submit"
          className="btn-primary"
          data-testid="apply-submit"
          disabled={status === "submitting"}
          aria-disabled={status === "submitting"}
        >
          {status === "submitting" ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </div>
  );
}
