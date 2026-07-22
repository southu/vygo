/**
 * Image-slot inventory for the Ratchet guide page
 * (/vibe-coding/ratchet-guide).
 *
 * One entry per figure slot, in guide order. Each figure in the guide renders a
 * <ScreenshotPlaceholder asset="…"> that emits a single <img> referencing the
 * `currentAsset` filename. This registry is the single source of truth behind
 * both the committed markdown inventory (docs/ratchet-guide-image-inventory.md)
 * and the public inventory page rendered at
 * /vibe-coding/ratchet-guide-image-inventory.
 *
 * Routes and UI-state descriptions were confirmed by loading the live
 * dash.saniorem.com pages over HTTP and matching them against the guide prose:
 *   - /composer  (Ratchet Mission Composer)  → HTTP 200
 *   - /dashboard (Active runs)               → HTTP 200
 * `status` is "OK" only when every element named below is confirmed present on
 * the live dashboard; otherwise "NEEDS-REVIEW".
 */

export type InventoryStatus = "OK" | "NEEDS-REVIEW";

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
};

export const imageInventory: ImageSlot[] = [
  {
    slot: "fig-01-product-shell-setup",
    currentAsset: "ratchet-guide-composer-product-shell-setup.png",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › Target project + Deploy fieldset: the repo field (Git remote), the live_url field (Live URL), and the version_endpoint field (Version endpoint) — all three fields confirmed present on the live composer.",
    plannedAsset: "ratchet-guide-composer-product-shell-setup.png",
    status: "OK",
  },
  {
    slot: "fig-02-goal-capture",
    currentAsset: "ratchet-guide-composer-goal-capture.png",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      'Composer › Goal section: the mission field captures the goal. No distinct Constraints field exists on the live composer — constraints are expressed via the acceptance criteria list (the + Add criterion and Skip buttons), so the guide\'s separate "Constraints field" no longer maps 1:1.',
    plannedAsset: "ratchet-guide-composer-goal-capture.png",
    status: "NEEDS-REVIEW",
  },
  {
    slot: "fig-03-draft-queue",
    currentAsset: "ratchet-guide-composer-draft-queue.png",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › Draft form / Mission queue panel: the server-rendered queue list with the Enqueue button and Priority order label. No Accept draft button is present — the live composer drafts via AI assist and commits with Inject into mission / Enqueue (queued items are also listed at /queue).",
    plannedAsset: "ratchet-guide-composer-draft-queue.png",
    status: "NEEDS-REVIEW",
  },
  {
    slot: "fig-04-run-limits",
    currentAsset: "ratchet-guide-composer-run-limits.png",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer › Limits section: the max_iterations field (Max iterations), the consecutive_passes_required field (Pass streak), and the max_budget_usd field (Spend cap) — all three limit fields confirmed present on the live composer.",
    plannedAsset: "ratchet-guide-composer-run-limits.png",
    status: "OK",
  },
  {
    slot: "fig-05-mission-control",
    currentAsset: "ratchet-guide-composer-mission-control.png",
    dashRoute: "https://dash.saniorem.com/composer",
    uiState:
      "Composer commit control: the guide's Start run button is not present on the live composer. A mission is committed with the Enqueue button and started by the queue runner; the /queue page carries the Pause and Resume run controls.",
    plannedAsset: "ratchet-guide-composer-mission-control.png",
    status: "NEEDS-REVIEW",
  },
  {
    slot: "fig-06-mission-timeline",
    currentAsset: "ratchet-guide-dashboard-mission-timeline.png",
    dashRoute: "https://dash.saniorem.com/dashboard",
    uiState:
      "Dashboard › Active runs panel: the runs table with Mission, Status, Iter, Streak, and Cost columns plus a Finished & aborted section. A distinct per-iteration build / deploy gate / test breakdown is not surfaced as separate elements on the live dashboard.",
    plannedAsset: "ratchet-guide-dashboard-mission-timeline.png",
    status: "NEEDS-REVIEW",
  },
];
