import type { Metadata } from "next";
import Link from "next/link";
import { CAMPAIGN_CONTEXT, STAGES } from "@/content/campaign-workspace";
import { RepoContext } from "@/components/campaign/RepoContext";

export const metadata: Metadata = {
  title: "Create campaign brief",
  description:
    "Create a new campaign brief in the Vygo campaign workspace — objective, audience, channels, owner, and success metric — scoped to the vygo folder in southu/vygo.",
};

export default function NewBriefPage() {
  return (
    <main id="main-content" data-page="campaign-new-brief">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <nav className="text-sm text-muted">
            <Link href="/campaigns" className="hover:text-purple">
              Campaign workspace
            </Link>
            <span className="mx-2">/</span>
            <span>New brief</span>
          </nav>

          <p className="eyebrow mt-6">Briefs</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Create a campaign brief
          </h1>
          <p className="mt-3 text-muted">
            Draft a new campaign. It starts in the drafting stage of the queue, scoped to the{" "}
            {CAMPAIGN_CONTEXT.folder} folder of {CAMPAIGN_CONTEXT.repoName}.
          </p>
          <RepoContext className="mt-4" />

          <form className="card mt-8" data-new-brief-form aria-label="Create campaign brief">
            <div className="grid gap-4">
              <label className="block text-sm">
                <span className="font-semibold text-ink">Campaign name</span>
                <input
                  name="name"
                  placeholder="e.g. Spring product launch"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Objective</span>
                <textarea
                  name="objective"
                  rows={2}
                  placeholder="What outcome should this campaign drive?"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Audience</span>
                <input
                  name="audience"
                  placeholder="Who is this for?"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Channels</span>
                <input
                  name="channels"
                  placeholder="Email, LinkedIn, Website…"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Owner</span>
                <input
                  name="owner"
                  placeholder="Assign an owner"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Success metric</span>
                <input
                  name="successMetric"
                  placeholder="How will you know it worked?"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Starting stage</span>
                <select
                  name="stage"
                  defaultValue="drafting"
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="submit" className="btn-primary">
                Create brief
              </button>
              <Link href="/campaigns" className="btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
