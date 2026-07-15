"use client";

import { useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api";
import { formatOpeningDate } from "@/lib/availability";
import { useAvailability } from "./AvailabilityProvider";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

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

/**
 * Client-side apply form. Submits to POST /api/apply (server-side only writes to
 * Postgres). On 2xx, replaces the form with an inline thank-you confirmation
 * (no navigation). On non-2xx or network failure, keeps entered values and
 * shows an inline error so the applicant can retry. Disables submit while the
 * request is in flight.
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setFeedback("");
    setCreatedId(null);

    const payload = {
      full_name: fullName,
      work_email: workEmail,
      product_url: productUrl.trim() || null,
      message: message.trim() || null,
    };

    try {
      const res = await fetch(apiUrl("/api/apply"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
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
        return;
      }

      const errorMessage =
        body?.error?.message ||
        (res.status >= 400 && res.status < 500
          ? "Please check your details and try again."
          : "Something went wrong. Please try again or email hello@vygo.ai.");
      setStatus("error");
      setFeedback(errorMessage);
    } catch {
      setStatus("error");
      setFeedback("Network error. Please check your connection and try again.");
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

  return (
    <div className="mt-10">
      <form
        className="space-y-5"
        data-testid="apply-form"
        aria-label="Application form"
        onSubmit={onSubmit}
        noValidate
      >
        <div>
          <label htmlFor="apply-name" className="block text-sm font-semibold text-ink">
            Full name
          </label>
          <input
            id="apply-name"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
            placeholder="Your name"
            data-testid="apply-full-name"
          />
        </div>

        <div>
          <label htmlFor="apply-email" className="block text-sm font-semibold text-ink">
            Work email
          </label>
          <input
            id="apply-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
            placeholder="you@company.com"
            data-testid="apply-work-email"
          />
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
            onChange={(e) => setProductUrl(e.target.value)}
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
            onChange={(e) => setMessage(e.target.value)}
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
