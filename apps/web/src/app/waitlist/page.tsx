import type { Metadata } from "next";
import { Suspense } from "react";
import { site } from "@/content/site";
import { waitlistContent } from "@/content/waitlist";
import { AvailabilityCard } from "@/components/AvailabilityCard";
import { WaitlistPageForm } from "@/components/WaitlistPageForm";
import { WaitlistPageIntro } from "@/components/WaitlistPageIntro";
import { TextWithEmail } from "@/components/TextWithEmail";

export const metadata: Metadata = {
  title: site.metadata.waitlistTitle,
  description: site.metadata.waitlistDescription,
};

export default function WaitlistPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page">
          <Suspense
            fallback={
              <div className="max-w-2xl">
                <p className="eyebrow">{waitlistContent.page.eyebrow}</p>
                <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
                  {waitlistContent.page.headline}
                </h1>
                <p className="mt-5 text-lg text-muted">
                  <TextWithEmail text={waitlistContent.page.body} />
                </p>
              </div>
            }
          >
            <WaitlistPageIntro />
          </Suspense>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-start">
            <div className="order-2 lg:order-1">
              <Suspense fallback={<div className="card min-h-[24rem]" aria-busy="true" />}>
                <WaitlistPageForm />
              </Suspense>
            </div>
            <div className="order-1 lg:order-2">
              <AvailabilityCard />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
