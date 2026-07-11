import Link from "next/link";
import { waitlistContent } from "@/content/waitlist";
import { ctaHrefs } from "@/content/ctas";

export function AvailabilityCard({ className = "" }: { className?: string }) {
  const { availabilityFallback } = waitlistContent;

  return (
    <aside
      className={`rounded-card bg-trust p-6 text-white shadow-card ${className}`}
      aria-label="Availability"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-green">
        {availabilityFallback.label}
      </p>
      <p className="mt-3 text-lg font-semibold leading-snug">{availabilityFallback.message}</p>
      <p className="mt-3 text-sm text-white/75">
        Senior-only pods. Limited concurrent engagements. Capacity is controlled operationally—no
        fabricated slot counts.
      </p>
      <Link href={ctaHrefs.waitlist} className="btn-on-dark mt-6">
        {availabilityFallback.cta}
      </Link>
    </aside>
  );
}
