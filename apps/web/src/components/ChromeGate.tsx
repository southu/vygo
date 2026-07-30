"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides the global site chrome (header, footer, availability bar, sticky CTA) on
 * campaign landing routes, which provide their own reduced-navigation shell. The
 * pathname is known at static-export time, so campaign pages are generated with
 * the global chrome already omitted.
 */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCampaign = pathname === "/campaign" || pathname?.startsWith("/campaign/");
  if (isCampaign) return null;
  return <>{children}</>;
}
