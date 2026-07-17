"use client";

import type { CSSProperties } from "react";
import { clampScore, scoreBand, SCORE_BAND_META } from "./scoreBands";
import type { ChartEvidence } from "./types";
import { hasChartEvidence } from "./types";
import { InteractiveChartSegment } from "./EvidenceTooltip";

export type GaugeSegment = {
  label: string;
  score: number;
  evidence?: ChartEvidence | null;
};

type ReadinessGaugeProps = {
  value: number;
  label?: string;
  className?: string;
  /** Dimension (or other) segments for interactive evidence tooltips. */
  segments?: GaugeSegment[];
  /** Overall-level evidence when interacting with the headline arc. */
  evidence?: ChartEvidence | null;
};

/** Polar helpers for upper semicircle (left → right arching up). SVG y grows down. */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  // Sweep=0 draws counterclockwise in SVG screen coords for upper semicircle left→right
  // when start is 180° and end is 0° — use sweep 1 for upper path when decreasing angle.
  const sweep = endDeg < startDeg ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`;
}

/**
 * Animated semicircular headline gauge for the overall readiness score (0–100).
 * Optional dimension segments are individually hoverable / tappable / focusable
 * and surface real sub-metric evidence tooltips when present.
 */
export function ReadinessGauge({
  value,
  label = "Overall readiness",
  className,
  segments,
  evidence,
}: ReadinessGaugeProps) {
  const pct = clampScore(value);
  const band = scoreBand(pct);
  const meta = SCORE_BAND_META[band];
  const rounded = Math.round(pct);

  const r = 80;
  const cx = 100;
  const cy = 100;
  const stroke = 14;
  const semiLen = Math.PI * r;
  const filled = (pct / 100) * semiLen;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;

  const segs = (segments ?? []).filter((s) => s.label);
  const hasSegEvidence = segs.some((s) => hasChartEvidence(s.evidence));
  const overallHasEvidence = hasChartEvidence(evidence);

  // Equal angular slices across the upper semicircle (180° → 0°).
  const segArcs =
    segs.length > 0
      ? segs.map((seg, i) => {
          const startDeg = 180 - (i * 180) / segs.length;
          const endDeg = 180 - ((i + 1) * 180) / segs.length;
          const midDeg = (startDeg + endDeg) / 2;
          const hit = polar(cx, cy, r, midDeg);
          return { seg, startDeg, endDeg, midDeg, hit, band: scoreBand(seg.score) };
        })
      : [];

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
          viewBox="0 0 200 130"
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
          {/* Dimension segment underlays (equal slices) for discoverability */}
          {segArcs.map(({ seg, startDeg, endDeg, band: sb }) => (
            <path
              key={`seg-track-${seg.label}`}
              d={arcPath(cx, cy, r + 18, startDeg, endDeg)}
              fill="none"
              stroke={SCORE_BAND_META[sb].color}
              strokeWidth={4}
              strokeLinecap="butt"
              opacity={0.55}
              data-gauge-segment-track={seg.label}
            />
          ))}
        </svg>

        {/* Interactive gauge segments as positioned hit targets on the arc */}
        {segArcs.length > 0 ? (
          <div className="pointer-events-none absolute inset-0" data-testid="gauge-segments">
            {segArcs.map(({ seg, hit, band: sb }) => {
              // viewBox 0 0 200 130 → percent positions
              const left = (hit.x / 200) * 100;
              const top = (hit.y / 130) * 100;
              return (
                <div
                  key={seg.label}
                  className="pointer-events-auto absolute"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <InteractiveChartSegment
                    score={clampScore(seg.score)}
                    evidence={seg.evidence}
                    label={seg.label}
                    segmentKind="gauge-segment"
                    testId={`gauge-segment-${slugify(seg.label)}`}
                    tooltipPlacement="bottom"
                    controlClassName="flex h-7 w-7 items-center justify-center rounded-full"
                  >
                    <span
                      className="chart-gauge-segment-dot inline-block h-3 w-3 rounded-full ring-2 ring-white"
                      style={{ background: SCORE_BAND_META[sb].color }}
                      data-band={sb}
                      data-gauge-segment={seg.label}
                    />
                  </InteractiveChartSegment>
                </div>
              );
            })}
          </div>
        ) : overallHasEvidence ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center"
            data-testid="gauge-segments"
          >
            <div className="pointer-events-auto">
              <InteractiveChartSegment
                score={pct}
                evidence={evidence}
                label={label}
                segmentKind="gauge-segment"
                testId="gauge-segment-overall"
                tooltipPlacement="bottom"
                controlClassName="rounded-full px-2 py-1"
              >
                <span
                  className="chart-gauge-segment-dot inline-block h-3 w-3 rounded-full bg-purple ring-2 ring-white"
                  data-gauge-segment="overall"
                />
              </InteractiveChartSegment>
            </div>
          </div>
        ) : null}

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

      {/* Accessible segment list (keyboard path + screen readers) when segments exist */}
      {segs.length > 0 && hasSegEvidence ? (
        <ul className="mt-4 flex flex-wrap justify-center gap-2" data-testid="gauge-segment-list">
          {segs.map((seg) => (
            <li key={`list-${seg.label}`}>
              <InteractiveChartSegment
                score={clampScore(seg.score)}
                evidence={seg.evidence}
                label={seg.label}
                segmentKind="gauge-segment"
                testId={`gauge-segment-chip-${slugify(seg.label)}`}
                tooltipPlacement="top"
                controlClassName="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink-soft"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: SCORE_BAND_META[scoreBand(seg.score)].color }}
                  aria-hidden
                />
                {seg.label}
                <span className="tabular-nums text-muted">{Math.round(clampScore(seg.score))}</span>
              </InteractiveChartSegment>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
