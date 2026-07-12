"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ctaHrefs, ctas } from "@/content/ctas";
import { useAvailability } from "./AvailabilityProvider";
import { useWaitlistModal } from "./WaitlistProvider";

type ApplyCtaProps = {
  children?: ReactNode;
  /** Visual variant matches site button styles. */
  variant?: "primary" | "secondary" | "on-dark" | "ghost-on-dark";
  className?: string;
  /** Force open-access navigation even in waitlist (used rarely). */
  forceHref?: string;
  /** data-testid for Playwright. */
  testId?: string;
};

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  "on-dark": "btn-on-dark",
  "ghost-on-dark": "btn-ghost-on-dark",
} as const;

/**
 * Primary apply / waitlist CTA that respects live availability:
 * - open → existing open-access flow (/waitlist)
 * - waitlist → opens WaitlistForm modal
 * - paused → non-submitting explanation control
 * - loading → busy, not incorrectly actionable
 * - stale/error → retry when appropriate for availability surfaces; for CTAs link to waitlist page
 */
export function ApplyCta({
  children,
  variant = "primary",
  className = "",
  forceHref,
  testId = "apply-cta",
}: ApplyCtaProps) {
  const { uiState, copy } = useAvailability();
  const { openWaitlist } = useWaitlistModal();
  const classes = `${variants[variant]} ${className}`.trim();
  const label = children ?? ctas.applyNextOpening;

  if (forceHref) {
    return (
      <Link href={forceHref} className={classes} data-testid={testId} data-cta-mode="forced">
        {label}
      </Link>
    );
  }

  if (uiState === "loading") {
    return (
      <button
        type="button"
        className={classes}
        disabled
        aria-busy="true"
        data-testid={testId}
        data-cta-mode="loading"
        data-availability-state="loading"
      >
        {label}
      </button>
    );
  }

  if (uiState === "paused") {
    return (
      <button
        type="button"
        className={`${classes} opacity-70`}
        disabled
        aria-disabled="true"
        data-testid={testId}
        data-cta-mode="paused"
        data-availability-state="paused"
        title="Enrollment is paused"
      >
        Enrollment paused
      </button>
    );
  }

  if (uiState === "waitlist") {
    return (
      <button
        type="button"
        className={classes}
        data-testid={testId}
        data-cta-mode="waitlist"
        data-availability-state="waitlist"
        onClick={(event) => openWaitlist(event.currentTarget)}
      >
        {children ?? copy.ctaLabel ?? ctas.joinWaitlist}
      </button>
    );
  }

  // open, stale (with last known open), error → open-access page remains safe destination
  const href = ctaHrefs.waitlist;
  return (
    <Link
      href={href}
      className={classes}
      data-testid={testId}
      data-cta-mode={uiState === "open" ? "open-access" : uiState}
      data-availability-state={uiState}
    >
      {label}
    </Link>
  );
}
