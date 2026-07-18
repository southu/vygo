"use client";

import { useRef, useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api";
import { APPLY_SUBMIT_TIMEOUT_MS } from "@/lib/apply-submit";

/**
 * Compact email-capture block for guide / product update notices.
 * POSTs to /api/apply with source=guide_updates. Never gates reading or
 * downloading the guide — this block is purely optional.
 *
 * Shared by the /vibe-coding hub and /vibe-coding/ratchet-guide index via GuideOffer.
 */

type SubmitStatus = "idle" | "submitting" | "success" | "error" | "validation";

const GUIDE_UPDATES_SOURCE = "guide_updates";
const GUIDE_UPDATES_FULL_NAME = "Guide updates";
const GUIDE_UPDATES_MESSAGE = "guide updates opt-in";
const SUCCESS_TEXT = "You're on the list.";
const VALIDATION_ERROR = "Enter a valid email address (include @ and a domain).";
const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Client-side check for obviously invalid emails before any network call. */
function isPlausibleEmail(value: string): boolean {
  const email = value.trim();
  if (!email || email.length > 320) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return false;
  if (!domain.includes(".")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function GuideNotifyBlock() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [validationError, setValidationError] = useState("");
  const submittingRef = useRef(false);

  const submit = async () => {
    if (submittingRef.current) return;

    const trimmedEmail = email.trim();
    if (!isPlausibleEmail(trimmedEmail)) {
      setStatus("validation");
      setValidationError(VALIDATION_ERROR);
      return;
    }

    submittingRef.current = true;
    setStatus("submitting");
    setValidationError("");

    const trimmedName = name.trim();
    const payload = {
      source: GUIDE_UPDATES_SOURCE,
      email: trimmedEmail,
      full_name: trimmedName || GUIDE_UPDATES_FULL_NAME,
      message: GUIDE_UPDATES_MESSAGE,
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

      // Success: HTTP 2xx only. Never inspect or render the response body
      // (it must not leak email/PII into the DOM).
      if (res.ok) {
        setStatus("success");
        return;
      }

      setStatus("error");
    } catch {
      setStatus("error");
    } finally {
      clearTimeout(timer);
      submittingRef.current = false;
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submit();
  };

  const onRetry = async () => {
    await submit();
  };

  if (status === "success") {
    return (
      <section
        className="section-pad border-t border-border bg-surface"
        data-section="guide-notify"
        aria-labelledby="guide-notify-heading"
      >
        <div className="container-page max-w-3xl">
          <div
            className="card max-w-xl"
            role="status"
            aria-live="polite"
            data-testid="guide-notify-success"
          >
            <h2 id="guide-notify-heading" className="font-display text-xl font-bold sm:text-2xl">
              Want to be notified when there are updates?
            </h2>
            <p
              className="mt-4 text-base font-medium text-ink"
              data-testid="guide-notify-success-message"
            >
              {SUCCESS_TEXT}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const isSubmitting = status === "submitting";
  const showError = status === "error";
  const showValidation = status === "validation" && validationError;

  return (
    <section
      className="section-pad border-t border-border bg-surface"
      data-section="guide-notify"
      aria-labelledby="guide-notify-heading"
    >
      <div className="container-page max-w-3xl">
        <div className="card max-w-xl">
          <h2 id="guide-notify-heading" className="font-display text-xl font-bold sm:text-2xl">
            Want to be notified when there are updates?
          </h2>
          <p className="mt-2 text-sm text-muted">
            Optional signup for Ratchet guide and product updates. Reading and downloading the guide
            never requires this form.
          </p>
          <form
            className="mt-6 space-y-4"
            data-testid="guide-notify-form"
            data-guide-notify
            onSubmit={onSubmit}
            noValidate
          >
            <div>
              <label htmlFor="guide-notify-name" className="block text-sm font-medium text-ink">
                Name <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="guide-notify-name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                className="mt-2 w-full min-h-11 rounded-lg border border-border bg-canvas px-4 py-2.5 text-base text-ink sm:text-sm"
                placeholder="Your name"
                data-testid="guide-notify-name"
              />
            </div>
            <div>
              <label htmlFor="guide-notify-email" className="block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="guide-notify-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "validation") {
                    setStatus("idle");
                    setValidationError("");
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={showValidation ? true : undefined}
                aria-describedby={showValidation ? "guide-notify-email-error" : undefined}
                className="mt-2 w-full min-h-11 rounded-lg border border-border bg-canvas px-4 py-2.5 text-base text-ink sm:text-sm"
                placeholder="you@example.com"
                data-testid="guide-notify-email"
              />
              {showValidation ? (
                <p
                  id="guide-notify-email-error"
                  className="mt-1.5 text-xs text-red"
                  role="alert"
                  data-testid="guide-notify-validation-error"
                  data-field-error="email"
                >
                  {validationError}
                </p>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted" data-guide-notify-privacy>
              Used only for guide/product update notices; no spam.
            </p>

            {showError ? (
              <div
                className="rounded-xl border border-red bg-red/5 p-4 text-sm text-red"
                role="alert"
                aria-live="assertive"
                data-testid="guide-notify-error"
              >
                <p>{GENERIC_ERROR}</p>
                <button
                  type="button"
                  className="btn-secondary mt-3 min-h-11"
                  onClick={onRetry}
                  data-testid="guide-notify-retry"
                >
                  Try again
                </button>
              </div>
            ) : null}

            <div className="pt-1">
              <button
                type="submit"
                className="btn-primary w-full min-h-11 sm:w-auto"
                data-testid="guide-notify-submit"
                disabled={isSubmitting}
                aria-disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Submitting…" : "Notify me"}
              </button>
              {isSubmitting ? (
                <p
                  className="mt-2 text-sm text-muted"
                  role="status"
                  aria-live="polite"
                  data-testid="guide-notify-pending"
                >
                  Submitting…
                </p>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
