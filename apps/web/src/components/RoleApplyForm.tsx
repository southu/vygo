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
 * (the job-board edge function). On a confirmed 2xx it replaces the form with an
 * inline confirmation; on any failure it keeps the entered values and shows an
 * inline error so the applicant can retry.
 */
export function RoleApplyForm({ roleId, roleTitle }: RoleApplyFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [feedback, setFeedback] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setFeedback("");

    const payload = {
      name,
      email,
      resume: resume.trim() || null,
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
          Thank you — your application is in.
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
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="Your name"
          data-testid="role-apply-name"
        />
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
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="you@example.com"
          data-testid="role-apply-email"
        />
      </div>

      <div>
        <label htmlFor="role-apply-resume" className="block text-sm font-semibold text-ink">
          Resume or portfolio URL
        </label>
        <input
          id="role-apply-resume"
          name="resume"
          type="url"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
          placeholder="https://…"
          data-testid="role-apply-resume"
        />
      </div>

      <div>
        <label htmlFor="role-apply-cover" className="block text-sm font-semibold text-ink">
          Why this role?
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
