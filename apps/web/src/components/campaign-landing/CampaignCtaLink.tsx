"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CtaLink } from "@/components/CtaLink";
import { appendCampaignParamsToHref } from "@/lib/campaign/params";
import { useConversion } from "./ConversionProvider";

type CampaignCtaLinkProps = {
  href: string;
  children: ReactNode;
  /** Stable, non-empty location identifier for this CTA (e.g. "hero_primary"). */
  ctaLocation: string;
  variant?: "primary" | "secondary" | "on-dark" | "ghost-on-dark";
  className?: string;
};

/**
 * Campaign CTA wrapper around the shared {@link CtaLink}. Emits exactly one
 * `primary_cta_activation` per activation with a stable `cta_location`, and
 * propagates preserved campaign parameters onto same-origin destinations.
 *
 * The rendered href starts as the base href (matching server output) and is
 * augmented with session parameters after hydration to avoid a mismatch.
 */
export function CampaignCtaLink({
  href,
  children,
  ctaLocation,
  variant = "primary",
  className = "",
}: CampaignCtaLinkProps) {
  const { emitCtaActivation } = useConversion();
  const [resolvedHref, setResolvedHref] = useState(href);

  useEffect(() => {
    setResolvedHref(appendCampaignParamsToHref(href));
  }, [href]);

  // Capture the click before navigation so the activation beacon is sent even
  // when the CTA immediately navigates away. Works for both link and modal CTAs.
  return (
    <span
      className="contents"
      onClickCapture={() => emitCtaActivation(ctaLocation)}
      data-cta-location={ctaLocation}
    >
      <CtaLink href={resolvedHref} variant={variant} className={className}>
        {children}
      </CtaLink>
    </span>
  );
}
