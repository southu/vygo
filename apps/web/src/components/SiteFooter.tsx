import Link from "next/link";
import { brand } from "@vygo/ui";
import { getFooterNav } from "@/content/site";
import { hasPublishedInsights } from "@/content/insights";
import { ctas } from "@/content/ctas";
import { LogoText } from "./LogoText";

export function SiteFooter() {
  const nav = getFooterNav();
  const showInsights = hasPublishedInsights();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <LogoText />
          <p className="mt-4 max-w-sm text-sm text-muted">{brand.tagline}</p>
          <p className="mt-3 text-sm text-ink-soft">{brand.promise}</p>
          <p className="mt-4">
            <a
              href={`mailto:${brand.email}`}
              className="text-sm font-semibold text-purple hover:text-purple-dark"
            >
              {brand.email}
            </a>
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Explore</p>
          <ul className="mt-4 space-y-2">
            {nav
              .filter((item) => item.href !== "/privacy" && item.href !== "/terms")
              .map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-muted hover:text-purple">
                    {item.label}
                  </Link>
                </li>
              ))}
            {showInsights ? (
              <li>
                <Link href="/insights" className="text-sm text-muted hover:text-purple">
                  Insights
                </Link>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Apply</p>
          <ul className="mt-4 space-y-2">
            <li>
              <Link
                href="/waitlist"
                className="text-sm font-semibold text-purple hover:text-purple-dark"
              >
                {ctas.applyNextOpening}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-sm text-muted hover:text-purple">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-sm text-muted hover:text-purple">
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} vygo. All rights reserved.</p>
          <p>Production engineering for AI-built software.</p>
        </div>
      </div>
    </footer>
  );
}
