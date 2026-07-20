"use client";

import { useEffect } from "react";

/**
 * Scroll-spy for the readiness pillar navigation. Watches every deep-dive pillar
 * section with an IntersectionObserver and toggles the `.active` class on the
 * matching quick-jump link in {@link ReadinessPillarNav}, so exactly one section
 * is highlighted as the reader scrolls.
 *
 * Both nav variants (the desktop sidebar and the mobile top bar) carry
 * `data-readiness-pillar-nav`; their links share the same section ids, so the
 * active section is computed once and applied to the matching link in whichever
 * variant is visible. Multiple links can point at the same section, so `.active`
 * is toggled per section id rather than per single link.
 *
 * Renders nothing: it wires behaviour onto the already server-rendered navs and
 * sections (resolved by each link's `#hash` -> section `id`), so the navs'
 * markup and their no-JS anchor navigation stay unchanged.
 *
 * IntersectionObserver is the core mechanism (acceptance criterion 2). Which
 * link is active is derived from live section positions each time the observer
 * fires, which makes fast jumps (keyboard End, scrollbar drags, quick-jump
 * clicks) settle on the correct single link. A passive, rAF-throttled
 * scroll/resize listener is layered on purely as a safety net for cases a
 * single observer callback can miss — most notably settling exactly at the page
 * bottom. It is event-driven, never interval polling.
 */
export function ReadinessScrollSpy() {
  useEffect(() => {
    const navs = Array.from(document.querySelectorAll<HTMLElement>("[data-readiness-pillar-nav]"));
    if (navs.length === 0) return;

    // Every anchor across every nav variant, each resolved to its target section.
    const linkItems = navs
      .flatMap((nav) => Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')))
      .map((link) => {
        const id = decodeURIComponent(link.hash.slice(1));
        const section = id ? document.getElementById(id) : null;
        return section ? { link, section, id } : null;
      })
      .filter(
        (item): item is { link: HTMLAnchorElement; section: HTMLElement; id: string } =>
          item !== null,
      );

    // Unique sections in document order — the set the active-section math walks.
    const seen = new Set<string>();
    const items = linkItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const lastItem = items[items.length - 1];
    if (!lastItem) return;

    const setActive = (activeItem: { id: string }) => {
      for (const { link, id } of linkItems) {
        link.classList.toggle("active", id === activeItem.id);
      }
    };

    const computeActive = () => {
      const doc = document.documentElement;

      // Bottom edge: once the page cannot scroll any further, the last section's
      // link wins even if that section is too short to fill the viewport or
      // dominate intersection ratios (acceptance criterion 6).
      const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= doc.scrollHeight - 2;
      if (atBottom) {
        setActive(lastItem);
        return;
      }

      // Reference line ~a third of the way down the viewport. The active section
      // is the last one whose top has crossed that line — a monotonic mapping
      // that always yields exactly one active link, in document order, and is
      // stable under fast scrolling because it reads live positions.
      const line = window.innerHeight * 0.3;
      let active = items[0];
      for (const item of items) {
        if (item.section.getBoundingClientRect().top - line <= 0) {
          active = item;
        } else {
          break;
        }
      }
      setActive(active ?? lastItem);
    };

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        computeActive();
      });
    };

    // Core mechanism: an IntersectionObserver over every pillar section. Any
    // change in which sections intersect the viewport re-derives the active
    // link. Multiple thresholds keep it responsive through fast scrolling.
    const observer = new IntersectionObserver(schedule, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    for (const { section } of items) observer.observe(section);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    computeActive();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
