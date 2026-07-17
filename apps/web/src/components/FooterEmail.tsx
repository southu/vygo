"use client";

import { useEffect, useState } from "react";
import { brand } from "@vygo/ui";

const atIndex = brand.email.indexOf("@");
const emailUser = brand.email.slice(0, atIndex);
const emailDomain = brand.email.slice(atIndex + 1);

/**
 * Footer contact email, rendered Cloudflare-safe.
 *
 * Cloudflare's email obfuscation rewrites `mailto:` anchors in served HTML
 * into `/cdn-cgi/l/email-protection#…` links, and that path 404s on direct
 * request — so every page failed link checking through no fault of its own.
 * The anchor therefore renders server-side without an href and with a
 * human-readable label; after hydration it upgrades to a real `mailto:` link
 * showing the full address. Neither the address nor a `mailto:` href ever
 * appears in the served markup, so there is nothing for the edge to rewrite.
 */
export function FooterEmail({ className }: { className?: string }) {
  const [href, setHref] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState(`${emailUser} [at] ${emailDomain}`);

  useEffect(() => {
    setHref(`mailto:${brand.email}`);
    setLabel(brand.email);
  }, []);

  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}
