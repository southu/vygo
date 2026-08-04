import { test, expect } from "@playwright/test";

/**
 * The visible point is drawn by Chart.js; each point also has exactly one
 * transparent DOM marker/hotspot for tooltip and keyboard interaction. Keeping
 * this count in lockstep with the chart data catches the former double-dot
 * regression, where an extra visible hotspot was layered over a canvas point.
 */
for (const axisCount of [3, 5, 8]) {
  test(`radar renders exactly one marker per axis for ${axisCount} axes`, async ({ page }) => {
    const chartConsoleMessages: string[] = [];
    page.on("console", (message) => {
      if (
        (message.type() === "error" || message.type() === "warning") &&
        /radar|chart|duplicate.*key|two children.*same key/i.test(message.text())
      ) {
        chartConsoleMessages.push(message.text());
      }
    });

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

    // The canvas owns the visible points. A second, styled DOM node at a
    // hotspot would overlap the Chart.js point and recreate the duplicate-dot
    // regression this spec protects.
    await expect(chart.locator(".radar-node-marker")).toHaveCount(0);

    // Axis identity must remain one-to-one, not merely a coincidental count.
    const uniqueAxisCount = await markers.evaluateAll((nodes) => {
      const axes = nodes.map((node) => node.getAttribute("data-radar-axis"));
      return new Set(axes).size === nodes.length;
    });
    expect(uniqueAxisCount).toBe(true);

    // A duplicate React key is a browser-console warning and can leave an old
    // marker node in place after a report refresh. The radar must remain quiet
    // while it lays out its transparent hotspots.
    expect(chartConsoleMessages).toEqual([]);
  });
}
