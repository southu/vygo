"use client";

import { useEffect, useState } from "react";

/**
 * Fixed "back to top" affordance for long guide pages. Appears once the
 * reader has scrolled roughly a viewport height down, and returns to the
 * top of the page (the skip target used by the site's own skip link).
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.75);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <a
      href="#main-content"
      className="fixed bottom-24 right-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-card transition-colors hover:border-purple hover:text-purple sm:right-6 lg:bottom-8 lg:right-8"
      data-testid="guide-back-to-top"
    >
      <span aria-hidden="true">↑</span>
      Back to top
    </a>
  );
}
