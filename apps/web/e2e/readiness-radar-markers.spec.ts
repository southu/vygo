import { test, expect } from "@playwright/test";

/**
 * The visible point is drawn by Chart.js; each point also has exactly one
 * transparent DOM marker/hotspot for tooltip and keyboard interaction. Keeping
 * this count in lockstep with the chart data catches the former double-dot
 * regression, where an extra visible hotspot was layered over a canvas point.
 */
for (const axisCount of [3, 5, 8]) {
  test(`radar renders exactly one marker per axis for ${axisCount} axes`, async ({ page }) => {
    await page.route("**/v1/readiness/score-preview", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          overall: 50,
          dimensionResults: Array.from({ length: 5 }, (_, index) => ({
            dimension: `Preview axis ${index + 1}`,
            score: 20 + index * 15,
            sub_metrics: [],
          })),
        }),
      });
    });
    await page.goto(`/staging/charts?axes=${axisCount}`);

    const chart = page.getByTestId("readiness-radar-chart");
    await expect(chart).toBeVisible();

    const markers = chart.getByTestId("radar-axis-marker");
    await expect(markers).toHaveCount(axisCount);
    await expect(markers.first()).toHaveAttribute("data-radar-score", "0");
    await expect(markers.last()).toHaveAttribute("data-radar-score", "100");

    // Axis identity must remain one-to-one, not merely a coincidental count.
    const uniqueAxisCount = await markers.evaluateAll((nodes) => {
      const axes = nodes.map((node) => node.getAttribute("data-radar-axis"));
      return new Set(axes).size === nodes.length;
    });
    expect(uniqueAxisCount).toBe(true);
  });
}
