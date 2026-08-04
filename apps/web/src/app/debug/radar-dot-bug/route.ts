import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * Read-only deployment diagnostic for the readiness radar duplicate-dot report.
 * Keep this independent of scoring and chart rendering so it cannot affect either.
 */
export function GET() {
  return NextResponse.json({
    root_cause:
      "A duplicate marker/point layer is stacked on the Chart.js radar dataset's built-in points: the dataset enables pointRadius, then the evidence hotspot overlay renders a visible .radar-node-marker at the same Chart.js meta point coordinates.",
    file: "apps/web/src/components/charts/ReadinessRadarChart.tsx",
    line: "105-112, 257-300",
    reproduced_locally: true,
    reproduction_notes:
      "Locally rendered /readiness/snapshot?id=00000000-0000-4000-a000-0000000000e3 (the built-in mixed report fixture). Each evidence-bearing radar axis produced one Chart.js canvas point from pointRadius: 5 and one overlaid DOM .radar-node-marker after layoutHotspots copied that point's x/y coordinate; the two visible dots coincide. The dataset has one value per dimension, and the component destroys its prior Chart instance before creating another, ruling out duplicate score records and React remount rendering.",
    example_report_id: "mixed (00000000-0000-4000-a000-0000000000e3)",
  });
}
