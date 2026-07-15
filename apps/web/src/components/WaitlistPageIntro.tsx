"use client";

import { useSearchParams } from "next/navigation";
import { waitlistContent } from "@/content/waitlist";
import { hardenInquiryCopy, parseOfferFromSearch } from "@/content/inquiry-offers";

/**
 * Waitlist page intro that adapts when ?offer=harden identifies a free
 * vygo Harden assessment rather than the Production Readiness Audit path.
 */
export function WaitlistPageIntro() {
  const searchParams = useSearchParams();
  const offer = parseOfferFromSearch(searchParams.toString());
  const isHarden = offer === "harden";

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">
        {isHarden ? "FREE FIT ASSESSMENT" : waitlistContent.page.eyebrow}
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
        {isHarden ? hardenInquiryCopy.heading : waitlistContent.page.headline}
      </h1>
      <p className="mt-5 text-lg text-muted">
        {isHarden ? hardenInquiryCopy.body : waitlistContent.page.body}
      </p>
    </div>
  );
}
