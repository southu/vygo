"use client";

import { useEffect, useState } from "react";
import { brand } from "@vygo/ui";

const atIndex = brand.email.indexOf("@");
const emailUser = brand.email.slice(0, atIndex);
const emailDomain = brand.email.slice(atIndex + 1);

/**
 * Inline email address rendered Cloudflare-safe.
 *
 * Cloudflare's email obfuscation rewrites even plain-text addresses in the
 * served HTML into `/cdn-cgi/l/email-protection` anchors, and that path 404s
 * on direct request — so the address is composed only after hydration. The
 * server-rendered label stays human-readable without matching an email
 * pattern, giving the edge rewriter nothing to match.
 */
export function EmailText() {
  const [label, setLabel] = useState(`${emailUser} [at] ${emailDomain}`);

  useEffect(() => {
    setLabel(brand.email);
  }, []);

  return <span>{label}</span>;
}
