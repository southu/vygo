"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides the global site chrome (header, footer, availability bar, sticky CTA) on
 * campaign landing routes, which provide their own reduced-navigation shell. The
 * pathname is known at static-export time, so campaign pages are generated with
 * the global chrome already omitted.
 */
/**
 * Campaign landing routes that render their own reduced-navigation shell and
 * therefore suppress the global site chrome. Includes the shared
 * `/campaign/[slug]` surface and the independently addressable campaign pages.
 */
function isCampaignRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/campaign" ||
    pathname.startsWith("/campaign/") ||
    pathname === "/ai-workforce-capability-assessment" ||
    pathname === "/learning-development-leaders" ||
    pathname === "/leaders/workforce-capability"
  );
}

export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isCampaignRoute(pathname)) return null;
  return <>{children}</>;
}
