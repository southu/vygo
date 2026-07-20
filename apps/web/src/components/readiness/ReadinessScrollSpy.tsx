"use client";

import { useEffect } from "react";

/**
 * Scroll-spy for the readiness pillar sidebar. Watches every deep-dive pillar
 * section with an IntersectionObserver and toggles the `.active` class on the
 * matching quick-jump link in {@link ReadinessPillarNav}, so exactly one link
 * is highlighted as the reader scrolls.
 *
 * Renders nothing: it wires behaviour onto the already server-rendered sidebar
 * and sections (resolved by the sidebar links' `#hash` -> section `id`), so the
 * sidebar's markup and its no-JS anchor navigation stay unchanged.
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
    const nav = document.querySelector<HTMLElement>('[data-testid="readiness-pillar-nav"]');
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    const items = links
      .map((link) => {
        const id = decodeURIComponent(link.hash.slice(1));
        const section = id ? document.getElementById(id) : null;
        return section ? { link, section } : null;
      })
      .filter((item): item is { link: HTMLAnchorElement; section: HTMLElement } => item !== null);

    const lastItem = items[items.length - 1];
    if (!lastItem) return;

    const setActive = (activeLink: HTMLAnchorElement) => {
      for (const { link } of items) {
        link.classList.toggle("active", link === activeLink);
      }
    };

    const computeActive = () => {
      const doc = document.documentElement;

      // Bottom edge: once the page cannot scroll any further, the last section's
      // link wins even if that section is too short to fill the viewport or
      // dominate intersection ratios (acceptance criterion 6).
      const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= doc.scrollHeight - 2;
      if (atBottom) {
        setActive(lastItem.link);
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
      setActive((active ?? lastItem).link);
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
