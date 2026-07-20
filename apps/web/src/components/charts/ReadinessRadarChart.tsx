"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Chart,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { CHART_BRAND, clampScore } from "./scoreBands";
import type { ChartDimension } from "./types";
import { hasChartEvidence } from "./types";
import { InteractiveChartSegment } from "./EvidenceTooltip";

Chart.register(
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

type ReadinessRadarChartProps = {
  dimensions: ChartDimension[];
  className?: string;
};

type AxisHotspot = {
  dimension: ChartDimension;
  index: number;
  /** Percent left/top within the chart box for the axis point. */
  left: number;
  top: number;
};

/**
 * Multi-dimension posture radar (spider) chart for overall readiness.
 * Renders every scored dimension on a 0–100 radial scale.
 * Axes with real evidence get DOM hotspots for hover/tap/keyboard tooltips.
 */
export function ReadinessRadarChart({ dimensions, className }: ReadinessRadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart<"radar"> | null>(null);
  const uid = useId();
  const [hotspots, setHotspots] = useState<AxisHotspot[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.length === 0) return;

    const labels = dimensions.map((d) => d.dimension);
    const values = dimensions.map((d) => clampScore(d.score));

    const config: ChartConfiguration<"radar"> = {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "Readiness",
            data: values,
            backgroundColor: "rgba(91, 71, 224, 0.18)",
            borderColor: CHART_BRAND.purple,
            borderWidth: 2,
            pointBackgroundColor: CHART_BRAND.purpleDark,
            pointBorderColor: "#ffffff",
            pointBorderWidth: 1.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.15,
        animation: {
          duration: 900,
          easing: "easeOutQuart",
          onComplete: () => {
            // Defer hotspot layout until after first paint of the chart.
            requestAnimationFrame(() => layoutHotspots());
          },
        },
        plugins: {
          legend: { display: false },
          // Built-in canvas tooltip disabled — we use evidence cards on DOM hotspots.
          tooltip: { enabled: false },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            beginAtZero: true,
            ticks: {
              stepSize: 25,
              showLabelBackdrop: false,
              color: CHART_BRAND.muted,
              font: { size: 10, family: "Open Sans, system-ui, sans-serif" },
              callback: (value) => String(value),
            },
            grid: { color: "rgba(227, 225, 218, 0.9)" },
            angleLines: { color: "rgba(227, 225, 218, 0.9)" },
            pointLabels: {
              color: CHART_BRAND.ink,
              font: {
                size: 11,
                weight: 600,
                family: "Montserrat, system-ui, sans-serif",
              },
              padding: 8,
            },
          },
        },
      },
    };

    const layoutHotspots = () => {
      const chart = chartRef.current;
      const wrap = wrapRef.current;
      if (!chart || !wrap) return;
      const meta = chart.getDatasetMeta(0);
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const next: AxisHotspot[] = [];
      meta.data.forEach((el, index) => {
        const dim = dimensions[index];
        if (!dim) return;
        // Chart.js point elements expose canvas-pixel x/y after layout.
        const x = typeof el.x === "number" ? el.x : NaN;
        const y = typeof el.y === "number" ? el.y : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        next.push({
          dimension: dim,
          index,
          left: (x / rect.width) * 100,
          top: (y / rect.height) * 100,
        });
      });

      // Fallback polar layout if Chart.js meta is empty (e.g. zero size).
      if (next.length === 0 && dimensions.length > 0) {
        const n = dimensions.length;
        for (let i = 0; i < n; i++) {
          const dim = dimensions[i];
          if (!dim) continue;
          const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const radius = 0.32; // fraction of box
          const cx = 0.5;
          const cy = 0.52;
          next.push({
            dimension: dim,
            index: i,
            left: (cx + radius * Math.cos(angle)) * 100,
            top: (cy + radius * Math.sin(angle)) * 100,
          });
        }
      }
      setHotspots(next);
    };

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, config);

    // Layout after mount and on resize.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => layoutHotspots()) : null;
    if (wrapRef.current && ro) ro.observe(wrapRef.current);
    // Immediate attempt (animation may also call layoutHotspots).
    const t = window.setTimeout(layoutHotspots, 50);
    const t2 = window.setTimeout(layoutHotspots, 400);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      ro?.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [dimensions]);

  const ariaSummary = dimensions
    .map((d) => `${d.dimension} ${Math.round(clampScore(d.score))}`)
    .join(", ");

  return (
    <div className={className} data-testid="readiness-radar-chart" data-chart="radar">
      <div ref={wrapRef} className="relative w-full">
        {/* pointer-events-none: axis hotspots sit above and must receive hover/tap */}
        <canvas
          ref={canvasRef}
          id={`readiness-radar-${uid}`}
          className="pointer-events-none block h-auto w-full"
          role="img"
          aria-label={`Overall readiness radar across dimensions: ${ariaSummary}`}
        />
        {/* Focusable axis hotspots over each radar point (DOM for a11y + tooltips) */}
        <div className="pointer-events-none absolute inset-0 z-10" data-testid="radar-hotspots">
          {hotspots.map((h) => {
            const dim = h.dimension;
            const score = clampScore(dim.score);
            if (!hasChartEvidence(dim.evidence)) {
              // Still render a non-interactive marker without affordance when no evidence.
              return (
                <div
                  key={`axis-${dim.dimension}`}
                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${h.left}%`, top: `${h.top}%` }}
                  data-radar-axis={dim.dimension}
                  data-has-evidence="false"
                />
              );
            }
            return (
              <div
                key={`axis-${dim.dimension}`}
                className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${h.left}%`, top: `${h.top}%` }}
              >
                <InteractiveChartSegment
                  score={score}
                  evidence={dim.evidence}
                  label={dim.dimension}
                  riskFactor={dim.riskFactor}
                  segmentKind="radar-axis"
                  testId={`radar-axis-${slugify(dim.dimension)}`}
                  tooltipPlacement={h.top < 40 ? "bottom" : "top"}
                  controlClassName="flex h-10 w-10 items-center justify-center rounded-full"
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full bg-purple-dark ring-2 ring-white"
                    data-radar-axis={dim.dimension}
                    data-score={Math.round(score)}
                  />
                </InteractiveChartSegment>
              </div>
            );
          })}
        </div>
      </div>

      {/* Keyboard-friendly axis list (always in tab order even if hotspot layout fails) */}
      {dimensions.some((d) => hasChartEvidence(d.evidence)) ? (
        <ul
          className="mt-3 flex flex-wrap justify-center gap-2"
          data-testid="radar-axis-list"
          aria-label="Radar dimension evidence"
        >
          {dimensions.map((dim) => {
            if (!hasChartEvidence(dim.evidence)) return null;
            return (
              <li key={`list-${dim.dimension}`}>
                <InteractiveChartSegment
                  score={clampScore(dim.score)}
                  evidence={dim.evidence}
                  label={dim.dimension}
                  riskFactor={dim.riskFactor}
                  segmentKind="radar-axis"
                  testId={`radar-axis-chip-${slugify(dim.dimension)}`}
                  tooltipPlacement="top"
                  controlClassName="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink-soft"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-purple" aria-hidden />
                  {dim.dimension}
                  <span className="tabular-nums text-muted">
                    {Math.round(clampScore(dim.score))}
                  </span>
                </InteractiveChartSegment>
              </li>
            );
          })}
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
