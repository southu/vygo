import Link from "next/link";
import { brand } from "@vygo/ui";
import { getFooterNav } from "@/content/site";
import { hasPublishedInsights } from "@/content/insights";
import { ctas } from "@/content/ctas";
import { legalMeta } from "@/content/legal";
import { LogoText } from "./LogoText";
import { ApplyCta } from "./ApplyCta";

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
          <p className="mt-2 text-xs text-muted">
            Operated by {legalMeta.operator}, {legalMeta.operatorDescription}.
          </p>
          <p className="mt-1 text-xs text-muted">
            Questions, privacy requests, or legal notices may be sent to{" "}
            <a
              href={`mailto:${legalMeta.contactEmail}`}
              className="font-medium text-purple hover:text-purple-dark"
            >
              {legalMeta.contactEmail}
            </a>
            . Notices are effective when received.
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
              <ApplyCta
                variant="secondary"
                className="!min-h-0 border-0 bg-transparent px-0 py-0 text-sm font-semibold text-purple shadow-none hover:bg-transparent hover:text-purple-dark"
                testId="footer-apply-cta"
              >
                {ctas.applyNextOpening}
              </ApplyCta>
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
          <p>
            © {new Date().getFullYear()} {legalMeta.operator}, {legalMeta.operatorDescription}. All
            rights reserved.
          </p>
          <p>
            Production engineering for AI-built software. Questions, privacy requests, or legal
            notices may be sent to{" "}
            <a href={`mailto:${brand.email}`} className="hover:text-purple">
              {brand.email}
            </a>
            . Notices are effective when received.
          </p>
        </div>
      </div>
    </footer>
  );
}
