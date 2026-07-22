import type { Metadata } from "next";
import { imageInventory } from "@/content/ratchet-guide-image-inventory";

/**
 * Public image-slot inventory for the Ratchet guide, served at
 * /vibe-coding/ratchet-guide-image-inventory.
 *
 * One table row per figure slot in the guide (in guide order). The table body
 * holds exactly `imageInventory.length` <tr> elements and no header <tr> — one
 * inventory row per figure slot, zero unmapped slots, zero extras. Each row's
 * Capture column records whether a fresh 1440x900 frame was written (the guide
 * renders an <img> for that slot) or the slot was flagged (frame-only, no image),
 * so the number of guide <img> references equals the count of "captured" rows.
 * Column names are provided by the legend above the table.
 */
export const metadata: Metadata = {
  title: "Ratchet guide · image-slot inventory",
  description:
    "Figure-slot inventory for the Ratchet guide: current asset, dash.saniorem.com route, UI state, planned asset, and review status — one row per figure.",
  robots: { index: false, follow: false },
};

const columns = [
  "Slot",
  "Current asset filename",
  "Dash route",
  "UI state & elements",
  "Planned asset name",
  "Status",
  "Capture",
];

export default function RatchetGuideImageInventoryPage() {
  const okCount = imageInventory.filter((r) => r.status === "OK").length;
  const reviewCount = imageInventory.length - okCount;
  const capturedCount = imageInventory.filter((r) => r.capture === "captured").length;
  const flaggedCount = imageInventory.length - capturedCount;

  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-5xl">
        <nav aria-label="Breadcrumb" className="text-sm text-muted" data-breadcrumb>
          <a href="/vibe-coding/ratchet-guide" className="font-medium text-purple hover:underline">
            Ratchet guide
          </a>
          <span aria-hidden="true" className="mx-2">
            /
          </span>
          <span>Image-slot inventory</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Ratchet guide — image-slot inventory
        </h1>

        <p className="mt-4 text-muted">
          One row per figure slot in the{" "}
          <a href="/vibe-coding/ratchet-guide" className="font-medium text-purple hover:underline">
            Ratchet guide
          </a>
          , in guide order. A <strong>captured</strong> slot renders one <code>&lt;img&gt;</code>{" "}
          whose filename appears in the <strong>Current asset filename</strong> column verbatim; a{" "}
          <strong>flagged</strong> slot renders a frame-only placeholder (no image) because the UI
          the guide describes is not on the live dashboard. Dash routes, UI states, and capture
          status were determined by driving the live <code>dash.saniorem.com</code> composer and
          dashboard in a headless Chromium session at a fixed 1440×900 @ 100% viewport and matching
          each screen against the guide prose. <strong>Coverage:</strong> {imageInventory.length}{" "}
          figure slots → {imageInventory.length} inventory rows (zero unmapped slots, zero extras).{" "}
          <strong>Status:</strong> {okCount} OK, {reviewCount} NEEDS-REVIEW.{" "}
          <strong>Capture:</strong> {capturedCount} captured, {flaggedCount} flagged. The
          machine-readable capture log is served at{" "}
          <a
            href="/content/ratchet-guide-assets/capture-log.json"
            className="font-mono text-xs text-purple hover:underline"
          >
            /content/ratchet-guide-assets/capture-log.json
          </a>
          .
        </p>

        <p className="mt-3 text-sm text-muted" data-inventory-legend>
          Columns, in order: {columns.join(" · ")}.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm" data-image-inventory>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <tbody>
              {imageInventory.map((row) => (
                <tr
                  key={row.slot}
                  data-figure-slot={row.slot}
                  className="border-t border-[var(--color-border)] align-top"
                >
                  <th scope="row" className="py-3 pr-4 font-mono text-xs font-semibold">
                    {row.slot}
                  </th>
                  <td className="py-3 pr-4 font-mono text-xs">{row.currentAsset}</td>
                  <td className="py-3 pr-4">
                    <a
                      href={row.dashRoute}
                      className="font-mono text-xs text-purple hover:underline"
                      rel="nofollow noreferrer"
                    >
                      {row.dashRoute}
                    </a>
                  </td>
                  <td className="py-3 pr-4">{row.uiState}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{row.plannedAsset}</td>
                  <td className="py-3 pr-4">
                    <span
                      data-status={row.status}
                      className={
                        row.status === "OK"
                          ? "font-semibold text-green-dark"
                          : "font-semibold text-amber"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <span
                      data-capture={row.capture}
                      className={
                        row.capture === "captured"
                          ? "font-semibold text-green-dark"
                          : "font-semibold text-amber"
                      }
                      title={row.captureReason}
                    >
                      {row.capture}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 text-sm text-muted">
          Source of truth: <code>apps/web/src/content/ratchet-guide-image-inventory.ts</code>. A
          mirrored markdown copy is committed at <code>docs/ratchet-guide-image-inventory.md</code>.
        </p>
      </div>
    </main>
  );
}
