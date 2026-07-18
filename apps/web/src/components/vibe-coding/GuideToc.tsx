"use client";

import { useEffect, useId, useRef, useState } from "react";

export type GuideTocEntry = {
  /** Matches the heading's id (and its URL fragment) exactly. */
  id: string;
  title: string;
  level: 2 | 3;
};

/**
 * Table of contents for the Ratchet how-to guide. Renders twice — a
 * top-of-content dropdown for narrow viewports and a sticky sidebar for
 * desktop — sharing one scroll-spy state so both stay in sync. Only one is
 * visible at a time (CSS `lg:` breakpoint); both exist in the DOM so the
 * full link list is always present in the served markup.
 */
export function GuideToc({ sections }: { sections: GuideTocEntry[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const visibleIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const order = sections.map((section) => section.id);
    const headings = order
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    if (window.location.hash) {
      const initial = window.location.hash.slice(1);
      if (order.includes(initial)) {
        setActiveId(initial);
      }
    }

    const updateActive = () => {
      const firstVisible = order.find((id) => visibleIds.current.has(id));
      if (firstVisible) {
        setActiveId(firstVisible);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.current.add(entry.target.id);
          } else {
            visibleIds.current.delete(entry.target.id);
          }
        }
        updateActive();
      },
      { rootMargin: "-100px 0px -65% 0px", threshold: 0 },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [sections]);

  const handleLinkClick = (id: string) => {
    setActiveId(id);
    setOpen(false);
  };

  return (
    <>
      <div className="mb-8 lg:hidden" data-guide-toc-mobile>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink"
          data-testid="guide-toc-toggle"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true">☰</span>
            On this page
          </span>
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>
        <nav
          id={panelId}
          aria-label="Table of contents"
          className={open ? "mt-2 rounded-xl border border-border bg-surface p-3" : "hidden"}
          data-guide-toc
        >
          <GuideTocList sections={sections} activeId={activeId} onLinkClick={handleLinkClick} />
        </nav>
      </div>

      <nav
        aria-label="Table of contents"
        className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto lg:block"
        data-guide-toc
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">On this page</p>
        <div className="mt-3">
          <GuideTocList sections={sections} activeId={activeId} onLinkClick={handleLinkClick} />
        </div>
      </nav>
    </>
  );
}

function GuideTocList({
  sections,
  activeId,
  onLinkClick,
}: {
  sections: GuideTocEntry[];
  activeId: string;
  onLinkClick: (id: string) => void;
}) {
  return (
    <ul className="space-y-1 text-sm">
      {sections.map((section) => {
        const isActive = section.id === activeId;
        return (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={() => onLinkClick(section.id)}
              aria-current={isActive ? "true" : undefined}
              data-guide-toc-link
              className={
                "block rounded-lg border-l-2 py-1.5 pr-2 transition-colors " +
                (section.level === 3 ? "pl-6 text-[0.8125rem]" : "pl-3 font-medium") +
                " " +
                (isActive
                  ? "active border-purple bg-purple-soft font-semibold text-purple"
                  : "border-transparent text-ink-soft hover:border-purple/40 hover:text-ink")
              }
            >
              {section.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
