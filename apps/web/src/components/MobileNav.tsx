"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { NavItem } from "@/content/site";

type MobileNavProps = {
  items: NavItem[];
  primaryCta: { label: string; href: string };
  insightsItem?: NavItem | null;
};

export function MobileNav({ items, primaryCta, insightsItem }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the menu button after close
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    // Move focus into the menu when opened
    const t = window.setTimeout(() => {
      firstLinkRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const allItems = insightsItem ? [...items, insightsItem] : items;

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => (open ? close() : openMenu())}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-ink/40" role="presentation" onClick={close}>
          <div
            ref={panelRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-surface shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <p id={titleId} className="font-display text-lg font-bold">
                Menu
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-sm font-semibold"
                aria-label="Close menu"
                onClick={close}
              >
                ✕
              </button>
            </div>

            <nav aria-label="Mobile" className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
              {allItems.map((item, index) => (
                <Link
                  key={item.href}
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={item.href}
                  className="rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-purple-soft"
                  onClick={close}
                >
                  {item.label}
                </Link>
              ))}
              <Link href={primaryCta.href} className="btn-primary mt-4" onClick={close}>
                {primaryCta.label}
              </Link>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
