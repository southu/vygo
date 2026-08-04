import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * Read-only deployment diagnostic for the readiness radar duplicate-dot report.
 * Keep this independent of scoring and chart rendering so it cannot affect either.
 */
export function GET() {
  return NextResponse.json({
    root_cause:
      "The evidence hotspot overlay formerly rendered a visible marker over the Chart.js radar dataset's built-in point at the same coordinates. The hotspot is now transparent, leaving Chart.js as the sole marker renderer.",
    file: "apps/web/src/components/charts/ReadinessRadarChart.tsx",
    line: "95-102, 243-290",
    reproduced_locally: true,
    reproduction_notes:
      "Locally rendered /readiness/snapshot?id=00000000-0000-4000-a000-0000000000e3 (the built-in mixed report fixture). Chart.js renders one point per dimension with pointRadius: 5; evidence hotspots copy those coordinates for interaction only and do not render a second marker. The dataset has one value per dimension, and the component destroys its prior Chart instance before creating another, ruling out duplicate score records and React remount rendering.",
    example_report_id: "mixed (00000000-0000-4000-a000-0000000000e3)",
  });
}
