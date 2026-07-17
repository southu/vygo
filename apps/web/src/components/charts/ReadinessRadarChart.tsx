"use client";

import { useEffect, useId, useRef } from "react";
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

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type ReadinessRadarChartProps = {
  dimensions: ChartDimension[];
  className?: string;
};

/**
 * Multi-dimension posture radar (spider) chart for overall readiness.
 * Renders every scored dimension on a 0–100 radial scale.
 */
export function ReadinessRadarChart({ dimensions, className }: ReadinessRadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<"radar"> | null>(null);
  const uid = useId();

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
            pointRadius: 4,
            pointHoverRadius: 6,
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
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = typeof ctx.parsed.r === "number" ? Math.round(ctx.parsed.r) : 0;
                return ` ${v}/100`;
              },
            },
          },
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

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, config);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [dimensions]);

  const ariaSummary = dimensions
    .map((d) => `${d.dimension} ${Math.round(clampScore(d.score))}`)
    .join(", ");

  return (
    <div
      className={className}
      data-testid="readiness-radar-chart"
      data-chart="radar"
    >
      <canvas
        ref={canvasRef}
        id={`readiness-radar-${uid}`}
        role="img"
        aria-label={`Overall readiness radar across dimensions: ${ariaSummary}`}
      />
    </div>
  );
}
