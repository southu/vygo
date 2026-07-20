"use client";

import { useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api";
import { APPLY_SUBMIT_TIMEOUT_MS } from "@/lib/apply-submit";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

type ApplySuccessBody = {
  id?: string;
};

type ApplyErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

type FieldErrors = {
  name?: string;
  email?: string;
  resume?: string;
};

/** Mirrors the server-side EMAIL_RE in api/_lib/jobs.ts so both agree. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side mirror of the server's required-field + email checks. */
function validateFields(values: { name: string; email: string; resume: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) {
    errors.name = "Please enter your name.";
  }
  const email = values.email.trim();
  if (!email) {
    errors.email = "Please enter your email.";
  } else if (!EMAIL_RE.test(email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (!values.resume.trim()) {
    errors.resume = "Add a resume link or paste your resume text.";
  }
  return errors;
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

type RoleApplyFormProps = {
  roleId: string;
  roleTitle: string;
};

/**
 * Role-specific application form. Submits to POST /api/roles/:id/applications
 * (the job-board edge function). Validates required fields and email format
 * client-side with inline messages before any request is attempted; the same
 * checks are enforced server-side. On a confirmed 2xx it replaces the form with
 * an inline confirmation; on any failure it keeps the entered values and shows
 * an inline error (including a friendly message when the role has closed) so the
 * applicant can correct and retry.
 */
export function RoleApplyForm({ roleId, roleTitle }: RoleApplyFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [feedback, setFeedback] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "submitting") return;

    const errors = validateFields({ name, email, resume });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus("idle");
      setFeedback("");
      return;
    }

    setFieldErrors({});
    setStatus("submitting");
    setFeedback("");

    const payload = {
      name: name.trim(),
      email: email.trim(),
      resume: resume.trim(),
      cover_note: coverNote.trim() || null,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APPLY_SUBMIT_TIMEOUT_MS);

    try {
      const res = await fetch(apiUrl(`/api/roles/${encodeURIComponent(roleId)}/applications`), {
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

      if (res.ok && typeof body.id === "string") {
        setStatus("success");
        return;
      }

      const errorMessage =
        body?.error?.message ||
        (res.status >= 400 && res.status < 500
          ? "Please check your details and try again."
          : "Something went wrong. Please try again or email hello@vygo.ai.");
      setStatus("error");
      setFeedback(errorMessage);
    } catch (err) {
      setStatus("error");
      setFeedback(
        isAbortError(err)
          ? "The request timed out. Please try again."
          : "Network error. Please check your connection and try again.",
      );
    } finally {
      clearTimeout(timer);
    }
  };

  if (status === "success") {
    return (
      <div
        className="rounded-xl border border-purple/30 bg-purple-soft/40 p-5"
        role="status"
        aria-live="polite"
        data-testid="role-apply-success"
      >
        <h3 className="font-display text-xl font-bold text-ink">
          Application received — thank you.
        </h3>
        <p className="mt-3 text-sm text-muted">
          We&apos;ve received your application for the {roleTitle} role. A member of the Vygo team
          reviews every application and will be in touch by email.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      data-testid="role-apply-form"
      aria-label={`Apply for ${roleTitle}`}
      onSubmit={onSubmit}
      noValidate
    >
      <div>
        <label htmlFor="role-apply-name" className="block text-sm font-semibold text-ink">
          Full name
        </label>
        <input
          id="role-apply-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError("name");
          }}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? "role-apply-name-error" : undefined}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="Your name"
          data-testid="role-apply-name"
        />
        {fieldErrors.name ? (
          <p
            id="role-apply-name-error"
            className="mt-1.5 text-sm text-red"
            role="alert"
            data-testid="role-apply-name-error"
          >
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="role-apply-email" className="block text-sm font-semibold text-ink">
          Email
        </label>
        <input
          id="role-apply-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError("email");
          }}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "role-apply-email-error" : undefined}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="you@example.com"
          data-testid="role-apply-email"
        />
        {fieldErrors.email ? (
          <p
            id="role-apply-email-error"
            className="mt-1.5 text-sm text-red"
            role="alert"
            data-testid="role-apply-email-error"
          >
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="role-apply-resume" className="block text-sm font-semibold text-ink">
          Resume link or pasted resume text
        </label>
        <textarea
          id="role-apply-resume"
          name="resume"
          rows={4}
          required
          value={resume}
          onChange={(e) => {
            setResume(e.target.value);
            clearFieldError("resume");
          }}
          aria-invalid={fieldErrors.resume ? true : undefined}
          aria-describedby={fieldErrors.resume ? "role-apply-resume-error" : undefined}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="Paste a link to your resume or portfolio (https://…) — or paste your resume text here."
          data-testid="role-apply-resume"
        />
        {fieldErrors.resume ? (
          <p
            id="role-apply-resume-error"
            className="mt-1.5 text-sm text-red"
            role="alert"
            data-testid="role-apply-resume-error"
          >
            {fieldErrors.resume}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="role-apply-cover" className="block text-sm font-semibold text-ink">
          Why this role? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="role-apply-cover"
          name="coverNote"
          rows={4}
          value={coverNote}
          onChange={(e) => setCoverNote(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="A few sentences on why you're a fit."
          data-testid="role-apply-cover"
        />
      </div>

      {status === "error" && feedback ? (
        <div
          className="rounded-xl border border-red bg-red/5 p-4 text-sm text-red"
          role="alert"
          aria-live="assertive"
          data-testid="role-apply-error"
        >
          {feedback}
        </div>
      ) : null}

      <button
        type="submit"
        className="btn-primary"
        data-testid="role-apply-submit"
        disabled={status === "submitting"}
        aria-disabled={status === "submitting"}
      >
        {status === "submitting" ? "Submitting…" : `Apply for this role`}
      </button>
    </form>
  );
}
