/**
 * Score-band helpers for readiness chart visuals.
 * Bands are machine-verifiable via data-band / CSS class:
 *   critical | warning | good
 */

export type ScoreBand = "critical" | "warning" | "good";

/** Critical < 40, warning 40–69, good ≥ 70 — mirrors posture traffic-light practice. */
export function scoreBand(score: number): ScoreBand {
  if (!Number.isFinite(score)) return "critical";
  if (score >= 70) return "good";
  if (score >= 40) return "warning";
  return "critical";
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

export const SCORE_BAND_META: Record<
  ScoreBand,
  { label: string; color: string; softBg: string; textClass: string; barClass: string }
> = {
  critical: {
    label: "Critical",
    color: "var(--color-red)",
    softBg: "#fbebe9",
    textClass: "text-red",
    barClass: "bg-red",
  },
  warning: {
    label: "Warning",
    color: "var(--color-amber)",
    softBg: "#fdf3e4",
    textClass: "text-amber",
    barClass: "bg-amber",
  },
  good: {
    label: "Good",
    color: "var(--color-green)",
    softBg: "#e7f5ee",
    textClass: "text-green-dark",
    barClass: "bg-green",
  },
};

/** Brand purple used for overall/radar fills (not severity-coded). */
export const CHART_BRAND = {
  purple: "#5b47e0",
  purpleDark: "#4535b8",
  purpleSoft: "#e8e6fa",
  ink: "#16181d",
  muted: "#64748b",
  border: "#e3e1da",
  canvas: "#fafaf8",
} as const;
