"use client";

import { useEffect, useState } from "react";
import { GUIDE_MODE_STORAGE_KEY, type GuideMode } from "@/lib/guide-mode";

function applyMode(mode: GuideMode) {
  document.querySelectorAll<HTMLDetailsElement>("[data-advanced-expander]").forEach((details) => {
    details.open = mode === "expert";
  });
}

/**
 * Page-level Beginner/Expert toggle for the how-to guide. Expert expands
 * every [data-advanced-expander] <details> at once; Beginner collapses them
 * all. This only ever sets `.open` on click — it never listens for a
 * reader's own summary clicks — so each expander stays independently
 * operable afterward. The choice persists in localStorage; the inline
 * script rendered alongside the guide body re-applies it before hydration
 * so a returning Expert reader doesn't see a flash of collapsed content.
 */
export function GuideModeToggle() {
  const [mode, setMode] = useState<GuideMode>("beginner");

  useEffect(() => {
    const stored = window.localStorage.getItem(GUIDE_MODE_STORAGE_KEY);
    setMode(stored === "expert" ? "expert" : "beginner");
  }, []);

  const selectMode = (next: GuideMode) => {
    setMode(next);
    window.localStorage.setItem(GUIDE_MODE_STORAGE_KEY, next);
    applyMode(next);
  };

  return (
    <div
      className="guide-mode-toggle flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
      data-guide-mode-toggle
    >
      <span className="text-sm font-semibold text-ink">Detail level</span>
      <div
        role="group"
        aria-label="Guide detail level"
        className="inline-flex rounded-lg border border-border p-1"
      >
        <button
          type="button"
          onClick={() => selectMode("beginner")}
          aria-pressed={mode === "beginner"}
          data-mode-button="beginner"
          className={
            "min-h-9 rounded-md px-3 text-sm font-semibold transition-colors " +
            (mode === "beginner" ? "bg-purple text-white" : "text-ink-soft hover:text-ink")
          }
        >
          Beginner
        </button>
        <button
          type="button"
          onClick={() => selectMode("expert")}
          aria-pressed={mode === "expert"}
          data-mode-button="expert"
          className={
            "min-h-9 rounded-md px-3 text-sm font-semibold transition-colors " +
            (mode === "expert" ? "bg-purple text-white" : "text-ink-soft hover:text-ink")
          }
        >
          Expert
        </button>
      </div>
      <p className="text-xs text-muted">
        Expert expands every &ldquo;Advanced&rdquo; section below; Beginner collapses them. You can
        still open or close any single one afterward.
      </p>
    </div>
  );
}
