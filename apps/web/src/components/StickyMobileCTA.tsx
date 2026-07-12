"use client";

import { ctas } from "@/content/ctas";
import { ApplyCta } from "./ApplyCta";

export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur lg:hidden">
      <ApplyCta className="w-full" testId="sticky-mobile-cta">
        {ctas.applyNextOpening}
      </ApplyCta>
    </div>
  );
}
