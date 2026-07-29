import type { Metadata } from "next";
import Link from "next/link";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Manage your Vygo account and product preferences: notifications, appearance, digest cadence, and privacy-safe usage analytics. Changes persist in your browser and are reflected on reload.",
};

export default function SettingsPage() {
  return (
    <main id="main-content" data-page="settings">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Account</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Settings</h1>
          <p className="mt-5 text-lg text-muted">
            View and update your core account and product preferences. Saved changes persist on this
            device and are reflected the next time you open Settings.
          </p>

          <div className="card mt-10">
            <SettingsPanel />
          </div>

          <p className="mt-6 text-sm text-muted">
            New here?{" "}
            <Link href="/onboarding" className="font-semibold text-purple hover:text-purple-dark">
              Take the getting-started tour
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
