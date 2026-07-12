"use client";

import Link from "next/link";
import { ctaHrefs } from "@/content/ctas";
import { useAvailability } from "./AvailabilityProvider";
import { useWaitlistModal } from "./WaitlistProvider";

export function AvailabilityCard({ className = "" }: { className?: string }) {
  const { uiState, isBusy, copy, refresh, data } = useAvailability();
  const { openWaitlist } = useWaitlistModal();

  const showAction = copy.action !== "none";
  const isRetry = copy.action === "retry";
  const isWaitlist = copy.action === "open-waitlist";
  const isOpenAccess = copy.action === "open-access";

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
        {showAction ? (
          isRetry ? (
            <button
              type="button"
              className="btn-on-dark"
              onClick={() => void refresh()}
              data-availability-action="retry"
            >
              {copy.ctaLabel}
            </button>
          ) : isWaitlist ? (
            <button
              type="button"
              className="btn-on-dark"
              onClick={(e) => openWaitlist(e.currentTarget)}
              data-availability-action="open-waitlist"
              data-testid="availability-card-cta"
            >
              {copy.ctaLabel}
            </button>
          ) : isOpenAccess ? (
            <Link
              href={ctaHrefs.waitlist}
              className="btn-on-dark"
              data-availability-action="open-access"
              data-testid="availability-card-cta"
            >
              {copy.ctaLabel}
            </Link>
          ) : null
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
