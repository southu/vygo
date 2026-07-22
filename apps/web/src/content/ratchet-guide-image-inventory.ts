/**
 * Image-slot inventory for the Ratchet guide page
 * (/vibe-coding/ratchet-guide).
 *
 * One entry per figure slot, in guide order. A "captured" slot renders a
 * <ScreenshotPlaceholder asset="…"> that emits a single <img> referencing the
 * `currentAsset` filename; a "flagged" slot renders the frame-only placeholder
 * (no <img>, no served asset) because the UI the guide describes is not present
 * on the live dashboard. This registry is the single source of truth behind both
 * the committed markdown inventory (docs/ratchet-guide-image-inventory.md) and
 * the public inventory page rendered at /vibe-coding/ratchet-guide-image-inventory.
 *
 * Routes, UI-state descriptions, and capture status were determined by driving
 * the live dash.saniorem.com dashboard in a headless Chromium session
 * (Playwright fallback — Chrome MCP unavailable) at a fixed 1440x900 @ 100%
 * viewport and matching each screen against the guide prose:
 *   - /composer  (Ratchet Mission Composer)  → HTTP 200
 *   - /dashboard (Active runs)               → HTTP 200
 * `status` is "OK" only when every element the guide names is confirmed present
 * on the live dashboard; otherwise "NEEDS-REVIEW". `capture` is "captured" only
 * when a clean, sanitized 1440x900 frame of the described screen was written;
 * otherwise "flagged" with a `captureReason`. The machine-readable capture log
 * (route visited, file written, status per slot) lives alongside the assets at
 * public/content/ratchet-guide-assets/capture-log.json.
 */

export type InventoryStatus = "OK" | "NEEDS-REVIEW";

export type CaptureStatus = "captured" | "flagged";

export type ImageSlot = {
  /** Stable slot id, in guide order. */
  slot: string;
  /** Current asset filename exactly as referenced in the guide source. */
  currentAsset: string;
  /** Exact dash.saniorem.com route the adjacent guide prose describes. */
  dashRoute: string;
  /** UI state + concrete elements (fields, buttons, panels) the prose calls out. */
  uiState: string;
  /** Planned new asset name — ratchet-guide-<section>-<state>.png. */
  plannedAsset: string;
  /** OK when the described UI is confirmed live, else NEEDS-REVIEW. */
  status: InventoryStatus;
  /** "captured" when a fresh 1440x900 frame was written, else "flagged". */
  capture: CaptureStatus;
  /** Required for flagged slots: why no image was written. */
  captureReason?: string;
};

export const imageInventory: ImageSlot[] = [
  {
    slot: "fig-01-product-shell-setup",
    currentAsset: "ratchet-guide-composer-product-shell-setup-opt.webp",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › Target project + Deploy fieldset: the repo field (Git remote), the live_url field (Live URL), and the version_endpoint field (Version endpoint) — all three fields confirmed present on the live composer.",
    plannedAsset: "ratchet-guide-composer-product-shell-setup.png",
    status: "OK",
    capture: "captured",
  },
  {
    slot: "fig-02-goal-capture",
    currentAsset: "ratchet-guide-composer-goal-capture-opt.webp",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      'Composer › Goal section: the mission field captures the goal. No distinct Constraints field exists on the live composer — constraints are expressed via the acceptance criteria list (the + Add criterion and Skip buttons), so the guide\'s separate "Constraints field" no longer maps 1:1.',
    plannedAsset: "ratchet-guide-composer-goal-capture.png",
    status: "NEEDS-REVIEW",
    capture: "captured",
  },
  {
    slot: "fig-03-draft-queue",
    currentAsset: "ratchet-guide-composer-draft-queue-opt.webp",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › Draft form / Mission queue panel: the server-rendered queue list with the Enqueue button and Priority order label. No Accept draft button is present — the live composer drafts via AI assist and commits with Inject into mission / Enqueue (queued items are also listed at /queue).",
    plannedAsset: "ratchet-guide-composer-draft-queue.png",
    status: "NEEDS-REVIEW",
    capture: "captured",
  },
  {
    slot: "fig-04-run-limits",
    currentAsset: "ratchet-guide-composer-run-limits-opt.webp",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › Limits section: the max_iterations field (Max iterations), the consecutive_passes_required field (Pass streak), and the max_budget_usd field (Spend cap) — all three limit fields confirmed present on the live composer.",
    plannedAsset: "ratchet-guide-composer-run-limits.png",
    status: "OK",
    capture: "captured",
  },
  {
    slot: "fig-05-mission-control",
    currentAsset: "ratchet-guide-composer-mission-control.png",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › mission.yaml preview pane: the Save & Launch button (save mission YAML and launch immediately) beside Copy / Download controls, with the composed demo mission YAML in view. The guide step was reworded from the retired 'Start run' control to Save & Launch, so the described UI is confirmed present on the live composer.",
    plannedAsset: "ratchet-guide-composer-mission-control.png",
    status: "OK",
    capture: "captured",
  },
  {
    slot: "fig-06-mission-timeline",
    currentAsset: "ratchet-guide-dashboard-mission-timeline.png",
    dashRoute: "https://dash.saniorem.com/dashboard",
    uiState:
      "Dashboard › Active runs panel: the runs table with Mission, Status, Iter, Streak, and Cost columns plus a Finished & aborted section. A distinct per-iteration build / deploy gate / test breakdown is not surfaced as separate elements on the live dashboard.",
    plannedAsset: "ratchet-guide-dashboard-mission-timeline.png",
    status: "NEEDS-REVIEW",
    capture: "flagged",
    captureReason:
      "The guide depicts a mission-timeline panel with a per-iteration build / deploy-gate / test breakdown. The live /dashboard surfaces an Active runs table (Mission/Status/Iter/Streak/Cost) but no per-iteration breakdown, and its runs data is control-plane-gated: an unauthenticated render shows a data-load error and an authenticated render would expose real operator run data (PII). No clean, sanitized timeline is capturable, so no image was written.",
  },
];
