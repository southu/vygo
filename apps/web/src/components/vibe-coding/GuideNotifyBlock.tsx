"use client";

import type { FormEvent } from "react";

/**
 * Compact email-capture block for guide / product update notices.
 * Markup + styles only: submit is a no-op (no API / external calls).
 * Shared by the /vibe-coding hub and /vibe-coding/ratchet-guide index via GuideOffer.
 */
export function GuideNotifyBlock() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Backend wiring for guide_updates comes in a later mission.
  }

  return (
    <section
      className="section-pad border-t border-border bg-surface"
      data-section="guide-notify"
      aria-labelledby="guide-notify-heading"
    >
      <div className="container-page max-w-3xl">
        <div className="card max-w-xl">
          <h2
            id="guide-notify-heading"
            className="font-display text-xl font-bold sm:text-2xl"
          >
            Want to be notified when there are updates?
          </h2>
          <p className="mt-2 text-sm text-muted">
            Optional signup for Ratchet guide and product updates. Reading and
            downloading the guide never requires this form.
          </p>
          <form
            className="mt-6 space-y-4"
            data-testid="guide-notify-form"
            data-guide-notify
            onSubmit={handleSubmit}
            noValidate
          >
            <div>
              <label
                htmlFor="guide-notify-name"
                className="block text-sm font-medium text-ink"
              >
                Name{" "}
                <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="guide-notify-name"
                name="name"
                type="text"
                autoComplete="name"
                className="mt-2 w-full min-h-11 rounded-lg border border-border bg-canvas px-4 py-2.5 text-base text-ink sm:text-sm"
                placeholder="Your name"
                data-testid="guide-notify-name"
              />
            </div>
            <div>
              <label
                htmlFor="guide-notify-email"
                className="block text-sm font-medium text-ink"
              >
                Email
              </label>
              <input
                id="guide-notify-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-2 w-full min-h-11 rounded-lg border border-border bg-canvas px-4 py-2.5 text-base text-ink sm:text-sm"
                placeholder="you@example.com"
                data-testid="guide-notify-email"
              />
            </div>
            <p className="text-xs leading-relaxed text-muted" data-guide-notify-privacy>
              Used only for guide/product update notices; no spam.
            </p>
            <div className="pt-1">
              <button
                type="submit"
                className="btn-primary w-full min-h-11 sm:w-auto"
                data-testid="guide-notify-submit"
              >
                Notify me
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
