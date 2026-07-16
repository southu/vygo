import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.LIVE_URL || "http://127.0.0.1:8380";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "tablet",
      // Harden release + site behavior must hold at mid-width viewports.
      testMatch: /(?:site-behavior|harden-release)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile",
      // mobile-drawer is the empty-drawer regression guard (viewport <= 480-class).
      testMatch: /(?:site-behavior|harden-release|mobile-drawer)\.spec\.ts/,
      // Chromium + mobile viewport (avoids requiring WebKit browser binaries).
      use: { ...devices["Pixel 5"] },
    },
  ],
});
