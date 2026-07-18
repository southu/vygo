"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { guideExpanderKey, guideExpanderStorageKey } from "@/lib/guide-mode";

/**
 * Collapsed-by-default "Advanced" expander for supplementary detail, edge
 * cases, and configuration deep-dives. A native <button> (not a <details>/
 * <summary> pair) so Enter and Space both reliably toggle it and its
 * aria-expanded state — <summary>'s built-in keyboard handling isn't
 * consistent across engines. Each instance owns its own open/close state via
 * `aria-expanded` on the button and `hidden` on its body, kept in sync by a
 * plain click listener rather than React state, so the page-level
 * Beginner/Expert toggle (GuideModeToggle) can drive every
 * [data-advanced-expander] element's state imperatively from outside without
 * fighting a React re-render.
 *
 * A reader's own open/close choice for this specific expander (independent
 * of the Beginner/Expert toggle) persists in localStorage, keyed by a slug
 * of its title; the inline script rendered alongside the guide body
 * re-applies it before hydration, matching the Expert-mode re-apply pattern.
 */
export function AdvancedExpander({ title, children }: { title: string; children: ReactNode }) {
  const contentId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const expanderKey = guideExpanderKey(title);

  useEffect(() => {
    const button = buttonRef.current;
    const body = bodyRef.current;
    if (!button || !body) return;

    const onClick = () => {
      const nextOpen = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      body.hidden = !nextOpen;
      try {
        window.localStorage.setItem(guideExpanderStorageKey(title), nextOpen ? "1" : "0");
      } catch {
        // storage unavailable — state still works for the current page view
      }
    };

    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  }, [title]);

  return (
    <div className="advanced-expander" data-advanced-expander data-expander-key={expanderKey}>
      <button
        type="button"
        ref={buttonRef}
        className="advanced-expander-summary"
        aria-expanded="false"
        aria-controls={contentId}
      >
        <span className="advanced-expander-badge">Advanced</span>
        <span className="advanced-expander-title">{title}</span>
        <span className="advanced-expander-icon" aria-hidden="true" />
      </button>
      <div id={contentId} ref={bodyRef} className="advanced-expander-body" hidden>
        {children}
      </div>
    </div>
  );
}
