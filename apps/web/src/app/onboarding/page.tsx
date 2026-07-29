import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "A short first-run tour of Vygo: how live-verified delivery works, running a readiness check, and setting your preferences. Continue, skip, or finish to land on the home page.",
};

export default function OnboardingPage() {
  return (
    <main id="main-content" data-page="onboarding">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Getting started</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Welcome to Vygo</h1>
          <p className="mt-5 text-lg text-muted">
            A three-step tour of how Vygo works. It takes under a minute — continue through the
            steps or skip ahead at any time.
          </p>

          <div className="mt-10">
            <OnboardingFlow />
          </div>
        </div>
      </section>
    </main>
  );
}
