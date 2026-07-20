/**
 * SINGLE source of truth for readiness severity styling.
 *
 * Maps a 0–100 score to a semantic tier plus the color classes and Lucide icon
 * that must always agree with that score. Every scored surface on the readiness
 * page (Evidence Strip / dimension cards and deep-dive sub-metrics) derives its
 * tier color + icon from this one function so tier and score can never disagree,
 * and later work (e.g. severity-aware CTAs) can reuse the same mapping.
 *
 * Strict, inclusive thresholds applied to the clamped score:
 *   Critical  0–49   deep red     AlertTriangle
 *   Warning  50–69   amber/orange AlertCircle
 *   Good     70–100  emerald      CheckCircle2
 */
import type { ComponentType, SVGProps } from "react";

export type SeverityTier = "critical" | "warning" | "good";

export type SeverityIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type SeverityStyle = {
  tier: SeverityTier;
  /** Human label for the tier ("Critical" | "Warning" | "Good"). */
  label: string;
  /** Tailwind text-color class for the score / label. */
  textClass: string;
  /** Tailwind border-color class for the card / chip. */
  borderClass: string;
  /** Tailwind background-color class for meter fills. */
  barClass: string;
  /** Tailwind background tint class for soft chips. */
  softBgClass: string;
  /** The Lucide icon whose meaning matches the tier. */
  Icon: SeverityIcon;
};

/** Clamp any incoming number into the 0–100 scored range. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

/**
 * Resolve the strict severity tier for a raw score. Non-finite scores fall to
 * the most conservative tier (critical) rather than silently rendering "good".
 */
export function severityTier(score: number): SeverityTier {
  const s = clampScore(score);
  if (s >= 70) return "good";
  if (s >= 50) return "warning";
  return "critical";
}

const STYLES: Record<SeverityTier, Omit<SeverityStyle, "tier">> = {
  critical: {
    label: "Critical",
    textClass: "text-red",
    borderClass: "border-red",
    barClass: "bg-red",
    softBgClass: "bg-red/10",
    Icon: AlertTriangleIcon,
  },
  warning: {
    label: "Warning",
    textClass: "text-amber-dark",
    borderClass: "border-amber",
    barClass: "bg-amber",
    softBgClass: "bg-amber/10",
    Icon: AlertCircleIcon,
  },
  good: {
    label: "Good",
    textClass: "text-green-dark",
    borderClass: "border-green",
    barClass: "bg-green",
    softBgClass: "bg-green/10",
    Icon: CheckCircle2Icon,
  },
};

/**
 * THE shared score → { tier, colorClasses, Icon } mapping. Feed it any numeric
 * score and render the returned classes + <Icon /> so severity styling stays
 * centralized and internally consistent.
 */
export function scoreSeverity(score: number): SeverityStyle {
  const tier = severityTier(score);
  return { tier, ...STYLES[tier] };
}

/* ------------------------------------------------------------------------- *
 * Lucide icons, inlined as SVG so no runtime icon dependency is required.
 * Geometry + class names match the corresponding Lucide icons exactly
 * (alert-triangle, alert-circle, check-circle-2) so severity is conveyed by
 * icon shape, never by color alone.
 * ------------------------------------------------------------------------- */

const svgBase = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Lucide `alert-triangle` — critical. */
export function AlertTriangleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...svgBase}
      {...props}
      className={`lucide lucide-alert-triangle${className ? ` ${className}` : ""}`}
      data-lucide="alert-triangle"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}

/** Lucide `alert-circle` — warning. */
export function AlertCircleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...svgBase}
      {...props}
      className={`lucide lucide-alert-circle${className ? ` ${className}` : ""}`}
      data-lucide="alert-circle"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

/** Lucide `check-circle-2` — good. */
export function CheckCircle2Icon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...svgBase}
      {...props}
      className={`lucide lucide-check-circle-2${className ? ` ${className}` : ""}`}
      data-lucide="check-circle-2"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}
