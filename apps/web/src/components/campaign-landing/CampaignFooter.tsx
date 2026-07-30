import Link from "next/link";
import { LogoText } from "@/components/LogoText";
import { CampaignConsent } from "./CampaignConsent";
import type { CampaignFooterConfig } from "@/lib/campaign/types";

/**
 * Reduced campaign footer with the approved privacy, terms, and accessibility
 * links plus the consent-management control.
 */
export function CampaignFooter({ footer }: { footer: CampaignFooterConfig }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page grid gap-8 py-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <LogoText />
          <p className="mt-4 max-w-sm text-sm text-muted">{footer.summary}</p>
          <div className="mt-5">
            <CampaignConsent />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Legal</p>
          <nav aria-label="Legal" className="mt-4">
            <ul className="space-y-2">
              {footer.legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted hover:text-purple">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page py-6 text-xs text-muted">
          <p>
            © {year} {footer.copyright}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
