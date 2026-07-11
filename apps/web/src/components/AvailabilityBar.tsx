import Link from "next/link";
import { waitlistContent } from "@/content/waitlist";
import { ctaHrefs } from "@/content/ctas";

/**
 * Truthful availability surface. Without a live API date, show the safe
 * fallback rather than inventing scarcity or openings.
 */
export function AvailabilityBar() {
  const { availabilityFallback } = waitlistContent;

  return (
    <div className="bg-trust text-white">
      <div className="container-page flex flex-col items-start justify-between gap-3 py-2.5 sm:flex-row sm:items-center">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/90 sm:text-sm sm:normal-case sm:tracking-normal sm:font-medium">
          <span className="mr-2 text-green">{availabilityFallback.label}</span>
          {availabilityFallback.message}
        </p>
        <Link
          href={ctaHrefs.waitlist}
          className="inline-flex min-h-10 items-center rounded-lg bg-green px-4 py-2 text-sm font-semibold text-white hover:bg-green-dark"
        >
          {availabilityFallback.cta} →
        </Link>
      </div>
    </div>
  );
}
