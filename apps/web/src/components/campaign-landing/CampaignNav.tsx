import Link from "next/link";
import { LogoText } from "@/components/LogoText";
import { CampaignCtaLink } from "./CampaignCtaLink";
import type { CampaignNavConfig } from "@/lib/campaign/types";

/**
 * Reduced campaign navigation: the vygo home link plus a short set of in-page
 * links and a single primary call-to-action. No full site menu.
 */
export function CampaignNav({ nav }: { nav: CampaignNavConfig }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-canvas/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <LogoText />
        <nav aria-label="Campaign" className="flex items-center gap-1">
          <Link
            href={nav.homeHref}
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-purple-soft hover:text-ink"
          >
            {nav.homeLabel}
          </Link>
          {nav.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-purple-soft hover:text-ink sm:inline-block"
            >
              {link.label}
            </a>
          ))}
          <CampaignCtaLink
            href={nav.cta.href}
            variant={nav.cta.variant ?? "primary"}
            className="ml-1 !min-h-0 px-3 py-2 text-sm"
            ctaLocation="nav_primary"
          >
            {nav.cta.label}
          </CampaignCtaLink>
        </nav>
      </div>
    </header>
  );
}
