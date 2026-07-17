"use client";

import { useEffect, useState } from "react";
import { brand } from "@vygo/ui";
import { EmailText } from "./EmailText";

/**
 * Footer contact email link, rendered Cloudflare-safe.
 *
 * Cloudflare's email obfuscation rewrites `mailto:` anchors in served HTML
 * into `/cdn-cgi/l/email-protection#…` links, and that path 404s on direct
 * request — so every page failed link checking through no fault of its own.
 * The anchor therefore renders server-side without an href, and hydration
 * upgrades it to a real `mailto:` link. The visible address comes from
 * EmailText, which likewise stays out of the served markup.
 */
export function FooterEmail({ className }: { className?: string }) {
  const [href, setHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    setHref(`mailto:${brand.email}`);
  }, []);

  return (
    <a href={href} className={className}>
      <EmailText />
    </a>
  );
}
