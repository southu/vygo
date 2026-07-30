"use client";

import { useId, useRef, useState } from "react";
import { SectionHeading } from "@/components/SectionHeading";
import { CampaignCtaLink } from "./CampaignCtaLink";
import { useConversion } from "./ConversionProvider";
import type { LeadSectionData } from "@/lib/campaign/types";

type Errors = { name?: string; email?: string; consent?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * On-page lead-capture form for the campaign persuasion flow. Every control has
 * an associated label, the consent control starts unchecked, and submitting
 * without required consent produces an accessible validation message without
 * sending the form. Submission is handled entirely client-side; on success it
 * hands off to the site's live application flow.
 */
export function LeadFormSection({ id, data }: { id: string; data: LeadSectionData }) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const emailId = `${baseId}-email`;
  const consentId = `${baseId}-consent`;
  const summaryId = `${baseId}-summary`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  const { emitFormStart, emitConversionError } = useConversion();
  const startedRef = useRef(false);

  function handleFirstInteraction() {
    if (startedRef.current) return;
    startedRef.current = true;
    emitFormStart(id);
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter your full name.";
    if (!email.trim()) next.email = "Enter your work email.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (!consent) next.consent = "Please confirm your consent before continuing.";
    return next;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Handled entirely on the client — the form never navigates or sends.
    event.preventDefault();
    // A submit attempt always counts as an interaction (keyboard-only paths).
    handleFirstInteraction();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setSubmitted(false);
      // Accessible client validation failure — never a conversion.
      emitConversionError(id, "validation_error", {
        error_count: Object.keys(next).length,
        error_fields: Object.keys(next).join(","),
      });
      if (next.name) nameRef.current?.focus();
      else if (next.email) emailRef.current?.focus();
      else if (next.consent) consentRef.current?.focus();
      return;
    }
    setSubmitted(true);
  }

  const errorCount = Object.keys(errors).length;
  const fieldClass =
    "mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-ink focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple";

  return (
    <section
      id={id}
      data-campaign-section="lead"
      data-section-id={id}
      className="section-pad border-t border-border bg-surface"
    >
      <div className="container-page">
        <div className="mx-auto max-w-xl">
          <SectionHeading eyebrow={data.eyebrow} title={data.title} intro={data.intro} />

          {/* Live region announces validation problems on submit. */}
          <div aria-live="assertive" role={errorCount > 0 ? "alert" : undefined}>
            {errorCount > 0 ? (
              <p
                id={summaryId}
                className="mt-6 rounded-lg bg-purple-soft px-4 py-3 text-sm text-ink"
              >
                Please fix {errorCount === 1 ? "the field" : `${errorCount} fields`} highlighted
                below.
              </p>
            ) : null}
          </div>

          {submitted ? (
            <div
              role="status"
              className="mt-6 rounded-card border border-border bg-canvas p-6 text-ink-soft"
            >
              <p className="font-semibold text-ink">{data.successMessage}</p>
              <div className="mt-4">
                <CampaignCtaLink href="/waitlist" variant="primary" ctaLocation="lead_complete">
                  Complete your application
                </CampaignCtaLink>
              </div>
            </div>
          ) : (
            <form
              className="mt-6 space-y-5"
              noValidate
              onSubmit={handleSubmit}
              onFocusCapture={handleFirstInteraction}
            >
              <div>
                <label htmlFor={nameId} className="text-sm font-medium text-ink">
                  {data.nameLabel} <span className="text-red">*</span>
                </label>
                <input
                  ref={nameRef}
                  id={nameId}
                  name="name"
                  type="text"
                  autoComplete="name"
                  className={fieldClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? `${nameId}-error` : undefined}
                />
                {errors.name ? (
                  <p id={`${nameId}-error`} className="mt-1 text-xs text-red">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor={emailId} className="text-sm font-medium text-ink">
                  {data.emailLabel} <span className="text-red">*</span>
                </label>
                <input
                  ref={emailRef}
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={fieldClass}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? `${emailId}-error` : undefined}
                />
                {errors.email ? (
                  <p id={`${emailId}-error`} className="mt-1 text-xs text-red">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor={consentId} className="flex items-start gap-3 text-sm text-ink-soft">
                  <input
                    ref={consentRef}
                    id={consentId}
                    name="consent"
                    type="checkbox"
                    className="mt-1"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    aria-invalid={Boolean(errors.consent)}
                    aria-describedby={errors.consent ? `${consentId}-error` : undefined}
                  />
                  <span>
                    {data.consentLabel}{" "}
                    <a href="/privacy" className="font-semibold text-purple underline">
                      Privacy Policy
                    </a>{" "}
                    and{" "}
                    <a href="/terms" className="font-semibold text-purple underline">
                      Terms of Use
                    </a>
                    . <span className="text-red">*</span>
                  </span>
                </label>
                {errors.consent ? (
                  <p id={`${consentId}-error`} className="mt-1 text-xs text-red">
                    {errors.consent}
                  </p>
                ) : null}
              </div>

              <button type="submit" className="btn btn-primary w-full sm:w-auto">
                {data.submitLabel}
              </button>

              {data.footnote ? <p className="text-xs text-muted">{data.footnote}</p> : null}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
