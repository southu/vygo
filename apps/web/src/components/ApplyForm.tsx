"use client";

import { useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api";

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

/**
 * Client-side apply form. Submits to POST /api/apply (server-side only writes to
 * Postgres). Shows a visible success confirmation on 2xx and an error message on
 * 4xx/5xx. Never embeds database credentials.
 */
export function ApplyForm() {
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

      if (res.ok && typeof body.id === "string") {
        setStatus("success");
        setCreatedId(body.id);
        setFeedback(
          "Thank you — your application has been received. A senior engineer at VYGO will review it against available openings.",
        );
        setFullName("");
        setWorkEmail("");
        setProductUrl("");
        setMessage("");
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

  return (
    <div className="mt-10">
      {status === "success" ? (
        <div
          className="rounded-xl border border-purple/30 bg-purple-soft/40 p-5"
          role="status"
          data-testid="apply-success"
          data-application-id={createdId ?? undefined}
        >
          <p className="text-base font-semibold text-ink">Application received</p>
          <p className="mt-2 text-sm text-muted" data-testid="apply-success-message">
            {feedback}
          </p>
          {createdId ? (
            <p className="mt-2 text-xs text-ink-soft" data-testid="apply-success-id">
              Reference: {createdId}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => {
              setStatus("idle");
              setFeedback("");
              setCreatedId(null);
            }}
            data-testid="apply-submit-another"
          >
            Submit another application
          </button>
        </div>
      ) : (
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
          >
            {status === "submitting" ? "Submitting…" : "Submit application"}
          </button>
        </form>
      )}
    </div>
  );
}
