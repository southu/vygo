import Link from "next/link";
import { getHeaderPrimaryCta, getPrimaryNav } from "@/content/site";
import { hasPublishedInsights } from "@/content/insights";
import { LogoText } from "./LogoText";
import { MobileNav } from "./MobileNav";

export function SiteHeader() {
  const nav = getPrimaryNav();
  const primaryCta = getHeaderPrimaryCta();
  const showInsights = hasPublishedInsights();
  const insightsItem = showInsights ? { href: "/insights", label: "Insights" as const } : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-canvas/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-[4.25rem]">
        <LogoText />

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex" data-nav="desktop">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-purple-soft hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          {insightsItem ? (
            <Link
              href={insightsItem.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-purple-soft hover:text-ink"
            >
              {insightsItem.label}
            </Link>
          ) : null}
          <Link href={primaryCta.href} className="btn-primary ml-2">
            {primaryCta.label}
          </Link>
        </nav>

        <MobileNav items={nav} primaryCta={primaryCta} insightsItem={insightsItem} />
      </div>
    </header>
  );
}
