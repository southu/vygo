"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { apiUrl } from "@/lib/api";
import { APPLY_SUBMIT_TIMEOUT_MS } from "@/lib/apply-submit";

/**
 * Landing-page "Start free" lead capture. Opens an accessible modal with an
 * email + submit control and posts to the existing lightweight /api/apply
 * intake (source=guide_updates) — same validated, tested path as the guide's
 * optional notify form, just triggered from the homepage's setup-first
 * section instead of gating the guide pack itself.
 */

type SubmitStatus = "idle" | "submitting" | "success" | "error" | "validation";

const LEAD_SOURCE = "guide_updates";
const LEAD_FULL_NAME = "Start free (landing)";
const LEAD_MESSAGE = "landing start free lead";
const SUCCESS_TEXT = "You're on the list — check your inbox shortly.";
const VALIDATION_ERROR = "Enter a valid email address (include @ and a domain).";
const GENERIC_ERROR = "Something went wrong. Please try again.";

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

export function StartFreeLeadForm() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [validationError, setValidationError] = useState("");
  const submittingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const formId = useId();
  const headingId = `${formId}-heading`;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => headingRef.current?.focus(), 0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setStatus("idle");
    setValidationError("");
    setEmail("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APPLY_SUBMIT_TIMEOUT_MS);

    try {
      const res = await fetch(apiUrl("/api/apply"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          source: LEAD_SOURCE,
          email: trimmedEmail,
          full_name: LEAD_FULL_NAME,
          message: LEAD_MESSAGE,
        }),
        credentials: "same-origin",
        signal: controller.signal,
      });

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

  const isSubmitting = status === "submitting";
  const showError = status === "error";
  const showValidation = status === "validation" && validationError;
  const isSuccess = status === "success";

  return (
    <>
      <button
        type="button"
        className="btn-primary"
        data-testid="start-free-cta"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Start free
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          data-testid="start-free-modal-backdrop"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card"
            data-testid="start-free-modal"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                ref={headingRef}
                id={headingId}
                tabIndex={-1}
                className="font-display text-xl font-bold text-ink outline-none"
              >
                Start free
              </h2>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-sm font-semibold"
                aria-label="Close"
                onClick={close}
                data-testid="start-free-dismiss"
              >
                ✕
              </button>
            </div>

            {isSuccess ? (
              <div role="status" aria-live="polite" data-testid="start-free-success">
                <p className="mt-4 text-base font-medium text-ink">{SUCCESS_TEXT}</p>
                <div className="mt-6">
                  <button type="button" className="btn-secondary" onClick={close}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  Enter your email and we&apos;ll send you the free Ratchet system guide pack.
                </p>
                <form
                  className="mt-6 space-y-4"
                  data-testid="start-free-form"
                  onSubmit={onSubmit}
                  noValidate
                >
                  <div>
                    <label htmlFor="start-free-email" className="block text-sm font-medium text-ink">
                      Email
                    </label>
                    <input
                      id="start-free-email"
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
                      aria-describedby={showValidation ? "start-free-email-error" : undefined}
                      className="mt-2 w-full min-h-11 rounded-lg border border-border bg-canvas px-4 py-2.5 text-base text-ink sm:text-sm"
                      placeholder="you@example.com"
                      data-testid="start-free-email"
                    />
                    {showValidation ? (
                      <p
                        id="start-free-email-error"
                        className="mt-1.5 text-xs text-red"
                        role="alert"
                        data-testid="start-free-validation-error"
                      >
                        {validationError}
                      </p>
                    ) : null}
                  </div>

                  {showError ? (
                    <div
                      className="rounded-xl border border-red bg-red/5 p-4 text-sm text-red"
                      role="alert"
                      aria-live="assertive"
                      data-testid="start-free-error"
                    >
                      {GENERIC_ERROR}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    className="btn-primary w-full min-h-11"
                    data-testid="start-free-submit"
                    disabled={isSubmitting}
                    aria-disabled={isSubmitting}
                    aria-busy={isSubmitting}
                  >
                    {isSubmitting ? "Submitting…" : "Send me the guide"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
