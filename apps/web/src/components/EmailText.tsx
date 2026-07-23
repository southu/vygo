"use client";

import { useEffect, useState } from "react";
import { brand } from "@vygo/ui";

function obfuscatedLabel(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex < 0) {
    return email;
  }
  return `${email.slice(0, atIndex)} [at] ${email.slice(atIndex + 1)}`;
}

/**
 * Inline email address rendered Cloudflare-safe.
 *
 * Cloudflare's email obfuscation rewrites even plain-text addresses in the
 * served HTML into `/cdn-cgi/l/email-protection` anchors, and that path 404s
 * on direct request — so the address is composed only after hydration. The
 * server-rendered label stays human-readable without matching an email
 * pattern, giving the edge rewriter nothing to match.
 *
 * @param address - Email to display (defaults to the public brand contact).
 */
export function EmailText({ address = brand.email }: { address?: string }) {
  const [label, setLabel] = useState(obfuscatedLabel(address));

  useEffect(() => {
    setLabel(address);
  }, [address]);

  return <span>{label}</span>;
}
