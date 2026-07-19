import Link from "next/link";
import { getHeaderPrimaryCta, getPrimaryNav } from "@/content/site";
import { hasPublishedInsights } from "@/content/insights";
import { LogoText } from "./LogoText";
import { MobileNav } from "./MobileNav";
import { ApplyCta } from "./ApplyCta";

export function SiteHeader() {
  const nav = getPrimaryNav();
  const primaryCta = getHeaderPrimaryCta();
  const showInsights = hasPublishedInsights();
  const insightsItem = showInsights ? { href: "/insights", label: "Insights" as const } : null;
  const readinessItem = nav.find((item) => item.href === "/readiness");

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-canvas/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-2 lg:h-[4.25rem] lg:gap-4">
        <LogoText />

        <nav aria-label="Primary" className="hidden items-center gap-1 xl:flex" data-nav="desktop">
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
          <ApplyCta className="ml-2" testId="desktop-primary-cta">
            {primaryCta.label}
          </ApplyCta>
        </nav>

        {/*
          Below xl the full nav collapses into the hamburger drawer, which requires
          a click to reveal any link. The Readiness Check link must stay reachable
          and tappable without that extra step, so it gets its own always-visible
          entry point next to the toggle at every width below xl.
        */}
        <div className="flex min-w-0 items-center gap-2 xl:hidden">
          {readinessItem ? (
            <Link
              href={readinessItem.href}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-purple/40 px-2.5 py-2 text-xs font-semibold text-purple hover:bg-purple-soft sm:px-3 sm:text-sm"
              data-testid="nav-readiness-link"
            >
              {readinessItem.label}
            </Link>
          ) : null}
          <MobileNav items={nav} primaryCta={primaryCta} insightsItem={insightsItem} />
        </div>
      </div>
    </header>
  );
}
