"use client";

import Link from "next/link";
import { ctaHrefs } from "@/content/ctas";
import { useAvailability } from "./AvailabilityProvider";

export function AvailabilityCard({ className = "" }: { className?: string }) {
  const { uiState, isBusy, copy, data } = useAvailability();

  // Actionable availability states surface the Apply CTA, which navigates to the
  // application form. Loading stays busy/non-actionable; paused shows no action.
  const showApply =
    uiState === "open" || uiState === "waitlist" || uiState === "stale" || uiState === "error";

  return (
    <aside
      className={`rounded-card bg-trust p-6 text-white shadow-card ${className}`}
      aria-label="Availability"
      data-availability-ui="card"
      data-availability-state={uiState}
      data-availability-status={data?.status ?? ""}
      aria-busy={isBusy || uiState === "loading" ? true : undefined}
    >
      <p
        className="text-xs font-semibold uppercase tracking-[0.08em] text-green"
        data-availability-label
      >
        {copy.label}
      </p>
      <p className="mt-3 text-lg font-semibold leading-snug" data-availability-message>
        {copy.message}
      </p>
      {uiState === "stale" ? (
        <p
          className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-200"
          data-stale-badge
        >
          Stale — last known safe state retained
        </p>
      ) : null}
      {copy.note ? <p className="mt-3 text-sm text-white/75">{copy.note}</p> : null}
      {uiState === "paused" ? (
        <p className="mt-3 text-sm text-white/80" data-paused-explanation>
          Enrollment is paused. Submission is not available until openings resume.
        </p>
      ) : null}
      {uiState === "error" ? (
        <p className="mt-3 text-sm text-white/80" data-availability-error>
          {copy.message}
        </p>
      ) : null}
      {uiState === "loading" ? (
        <p className="mt-3 text-sm text-white/70" role="status">
          Checking availability…
        </p>
      ) : null}

      <div className="mt-6">
        {showApply ? (
          <Link
            href={ctaHrefs.apply}
            className="btn-on-dark"
            data-availability-action="apply"
            data-testid="availability-card-cta"
          >
            Apply
          </Link>
        ) : (
          <span
            className="btn-on-dark pointer-events-none opacity-60"
            aria-disabled="true"
            data-availability-action="none"
          >
            {copy.ctaLabel}
          </span>
        )}
      </div>
    </aside>
  );
}
