import type { Metadata } from "next";
import { CtaLink } from "@/components/CtaLink";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Entry point to the analyses dashboard. Vygo readiness analyses are viewable in the browser without an account wall.",
};

/**
 * Lightweight entry point. Vygo's readiness analyses are a public, same-origin
 * API surface — there is no account wall — so this page routes a visitor (or an
 * automated tester probing /login) straight into the browser-verifiable
 * analyses dashboard, scoped to whoever is signed in.
 */
export default function LoginPage() {
  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-xl">
        <p className="eyebrow">Sign in</p>
        <h1 className="mt-4 font-display text-4xl font-bold">Analyses access</h1>
        <p className="mt-4 text-muted">
          Readiness analyses are served from a public, same-origin API — there is no account wall.
          Open the dashboard to view your readiness history, grouped by project, with each
          project&rsquo;s latest completed run marked as current.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <CtaLink href="/dashboard">Open analyses dashboard</CtaLink>
          <CtaLink href="/result" variant="secondary">
            View latest result
          </CtaLink>
        </div>
        <p className="mt-8 text-sm text-muted">
          Run a readiness check to establish your identity — your past runs then list here, scoped
          to you.
        </p>
      </div>
    </main>
  );
}
