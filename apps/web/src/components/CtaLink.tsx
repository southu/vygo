"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ctaHrefs } from "@/content/ctas";
import { ApplyCta } from "./ApplyCta";

type CtaLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "on-dark" | "ghost-on-dark";
  className?: string;
};

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  "on-dark": "btn-on-dark",
  "ghost-on-dark": "btn-ghost-on-dark",
} as const;

function isWaitlistHref(href: string): boolean {
  if (href === ctaHrefs.waitlist || href === "/waitlist") return true;
  try {
    const url = new URL(href, "https://vygo.ai");
    return url.pathname === "/waitlist" || url.pathname === ctaHrefs.waitlist;
  } catch {
    return false;
  }
}

/**
 * Site CTA link. Waitlist destinations become availability-aware Apply CTAs
 * (open-access flow vs WaitlistForm modal) so every primary apply path satisfies
 * the live availability contract without per-page wiring.
 */
export function CtaLink({ href, children, variant = "primary", className = "" }: CtaLinkProps) {
  if (isWaitlistHref(href)) {
    return (
      <ApplyCta variant={variant} className={className}>
        {children}
      </ApplyCta>
    );
  }

  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
  const classes = `${variants[variant]} ${className}`;

  if (isExternal) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
