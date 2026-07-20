"use client";

import { useEffect } from "react";

/**
 * Reads the `highlight=<tier-id>` query param the readiness micro-CTAs attach
 * (e.g. `/pricing?highlight=scale#scale`) and rings the matching pricing card on
 * load. The card is located by its `data-highlight-target` attribute, so the
 * highlight target is decoupled from the scroll anchor id and works for every
 * tier — Harden, the Production Readiness Audit, and each build tier.
 *
 * Renders nothing; it only applies a class (`pricing-card-highlight`, defined in
 * globals.css) and smooth-scrolls the card into view as a backup to the native
 * `#anchor` navigation.
 */
export function PricingHighlight() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("highlight");
    if (!raw) return;

    // Defensive: only accept simple tier-id tokens as a selector value.
    if (!/^[a-z0-9-]+$/i.test(raw)) return;

    const target = document.querySelector<HTMLElement>(`[data-highlight-target="${raw}"]`);
    if (!target) return;

    target.classList.add("pricing-card-highlight");
    target.setAttribute("data-highlighted", "true");

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }, []);

  return null;
}
