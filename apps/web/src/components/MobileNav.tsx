"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NavItem } from "@/content/site";
import { ApplyCta } from "./ApplyCta";

type MobileNavProps = {
  items: NavItem[];
  primaryCta: { label: string; href: string };
  insightsItem?: NavItem | null;
};

/**
 * Mobile navigation: keyboard open/close, correct expanded state, no focus trap
 * (criterion 30), links remain operable.
 *
 * The drawer is portaled to document.body so `position: fixed` is relative to the
 * viewport. The sticky header uses backdrop-filter, which would otherwise create a
 * containing block and clip the panel to the header height (Menu + close visible,
 * nav links empty/hidden).
 */
export function MobileNav({ items, primaryCta, insightsItem }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const allItems = insightsItem ? [...items, insightsItem] : items;

  const drawer =
    open && mounted
      ? createPortal(
          <div className="fixed inset-0 z-50 bg-ink/40" role="presentation" onClick={close}>
            <div
              ref={panelRef}
              id="mobile-navigation"
              role="navigation"
              aria-labelledby={titleId}
              className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-surface text-ink shadow-card"
              onClick={(e) => e.stopPropagation()}
              data-testid="mobile-navigation"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <p id={titleId} className="font-display text-lg font-bold text-ink">
                  Menu
                </p>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-sm font-semibold text-ink"
                  aria-label="Close menu"
                  onClick={close}
                >
                  ✕
                </button>
              </div>

              <nav
                aria-label="Mobile"
                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4"
              >
                {allItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-purple-soft"
                    onClick={close}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mt-4" onClick={close}>
                  <ApplyCta className="w-full" testId="mobile-primary-cta">
                    {primaryCta.label}
                  </ApplyCta>
                </div>
              </nav>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="xl:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        data-testid="mobile-nav-toggle"
        onClick={() => (open ? close() : openMenu())}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      {drawer}
    </div>
  );
}
