"use client";

import type { CSSProperties } from "react";
import { clampScore, scoreBand, SCORE_BAND_META } from "./scoreBands";

type ReadinessGaugeProps = {
  value: number;
  label?: string;
  className?: string;
};

/**
 * Animated semicircular headline gauge for the overall readiness score (0–100).
 * Pure SVG + CSS entrance animation (no canvas dependency).
 */
export function ReadinessGauge({
  value,
  label = "Overall readiness",
  className,
}: ReadinessGaugeProps) {
  const pct = clampScore(value);
  const band = scoreBand(pct);
  const meta = SCORE_BAND_META[band];
  const rounded = Math.round(pct);

  // Semicircle geometry: radius 80, stroke 14, center (100, 100)
  // Upper arc from left → right (counterclockwise in SVG = arching up).
  const r = 80;
  const cx = 100;
  const cy = 100;
  const stroke = 14;
  const semiLen = Math.PI * r;
  const filled = (pct / 100) * semiLen;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;

  return (
    <div
      className={className}
      data-testid="readiness-gauge"
      data-chart="gauge"
      data-band={band}
      data-score={rounded}
    >
      <div
        className="relative mx-auto w-full max-w-[280px]"
        role="img"
        aria-label={`${label}: ${rounded} out of 100, ${meta.label}`}
      >
        <svg
          viewBox="0 0 200 120"
          className="h-auto w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id="gauge-fill-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-purple)" />
              <stop offset="100%" stopColor="var(--color-purple-dark)" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path
            d={d}
            fill="none"
            stroke="var(--color-purple-soft)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {/* Animated value arc — dashoffset draws left→right */}
          <path
            className="readiness-gauge-arc"
            d={d}
            fill="none"
            stroke="url(#gauge-fill-gradient)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={semiLen}
            strokeDashoffset={semiLen - filled}
            style={
              {
                "--gauge-offset": String(semiLen - filled),
                "--gauge-total": String(semiLen),
              } as CSSProperties
            }
          />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-0">
          <span className="readiness-gauge-value font-display text-4xl font-bold leading-none tabular-nums text-ink sm:text-5xl">
            {rounded}
          </span>
          <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {label}
          </span>
          <span
            className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.textClass}`}
            style={{ background: meta.softBg }}
            data-band={band}
          >
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}
