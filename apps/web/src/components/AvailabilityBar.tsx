"use client";

import Link from "next/link";
import { ctaHrefs } from "@/content/ctas";
import { useAvailability } from "./AvailabilityProvider";

export function AvailabilityBar() {
  const { uiState, isBusy, copy, data } = useAvailability();

  // Actionable availability states surface the Apply CTA, which navigates to the
  // application form. Loading stays busy/non-actionable; paused shows no action.
  const showApply =
    uiState === "open" || uiState === "waitlist" || uiState === "stale" || uiState === "error";

  return (
    <div
      className="bg-trust text-white"
      data-availability-ui="bar"
      data-availability-state={uiState}
      data-availability-status={data?.status ?? ""}
      aria-busy={isBusy || uiState === "loading" ? true : undefined}
      role="region"
      aria-label="Current availability"
    >
      <div className="container-page flex flex-col items-start justify-between gap-3 py-2.5 sm:flex-row sm:items-center">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/90 sm:text-sm sm:normal-case sm:tracking-normal sm:font-medium">
          <span className="mr-2 text-green" data-availability-label>
            {copy.label}
          </span>
          <span data-availability-message>{copy.message}</span>
          {uiState === "stale" ? (
            <span className="ml-2 rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Stale
            </span>
          ) : null}
          {uiState === "loading" ? (
            <span className="sr-only" role="status">
              Loading availability
            </span>
          ) : null}
        </p>

        {showApply ? (
          <Link
            href={ctaHrefs.apply}
            /* bg-green/white is 2.62:1, below AA for normal text; bg-green-dark/white
               is 5.48:1 and is already the design system's established darker-green
               pairing (used as this same button's hover state elsewhere). */
            className="inline-flex min-h-10 items-center rounded-lg bg-green-dark px-4 py-2 text-sm font-semibold text-white hover:bg-purple-dark"
            data-availability-action="apply"
            data-testid="availability-bar-cta"
          >
            Apply →
          </Link>
        ) : (
          <span
            className="inline-flex min-h-10 items-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white/80"
            data-availability-action="none"
            aria-disabled="true"
          >
            {copy.ctaLabel}
          </span>
        )}
      </div>
    </div>
  );
}
