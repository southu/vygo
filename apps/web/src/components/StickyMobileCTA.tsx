import Link from "next/link";
import { ctas, ctaHrefs } from "@/content/ctas";

export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur lg:hidden">
      <Link href={ctaHrefs.waitlist} className="btn-primary w-full">
        {ctas.applyNextOpening}
      </Link>
    </div>
  );
}
