import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CAMPAIGNS,
  CAMPAIGN_CONTEXT,
  getCampaign,
  getTasksForCampaign,
  STAGES,
} from "@/content/campaign-workspace";
import { RepoContext } from "@/components/campaign/RepoContext";
import { TaskCard } from "@/components/campaign/TaskCard";

export function generateStaticParams() {
  return CAMPAIGNS.map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const campaign = getCampaign(id);
  return {
    title: campaign ? `${campaign.name} · Campaign brief` : "Campaign brief",
    description: campaign
      ? `${campaign.name} — ${campaign.brief.objective} Scoped to the ${CAMPAIGN_CONTEXT.folder} folder of ${CAMPAIGN_CONTEXT.repoName}.`
      : "Campaign brief.",
  };
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();

  const tasks = getTasksForCampaign(campaign.id);

  return (
    <main id="main-content" data-page="campaign-detail" data-campaign-id={campaign.id}>
      <section className="section-pad">
        <div className="container-page">
          <nav className="text-sm text-muted">
            <Link href="/campaigns" className="hover:text-purple">
              Campaign workspace
            </Link>
            <span className="mx-2">/</span>
            <span>{campaign.name}</span>
          </nav>

          <p className="eyebrow mt-6">
            {STAGES.find((s) => s.id === campaign.stage)?.label ?? campaign.stage} stage
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{campaign.name}</h1>
          <RepoContext className="mt-4" />

          {/* Editable brief */}
          <form className="card mt-8 max-w-3xl" data-brief-editor aria-label="Edit campaign brief">
            <h2 className="font-display text-xl font-semibold">Campaign brief</h2>
            <p className="mt-1 text-sm text-muted">
              Edit the brief fields below. This workspace keeps briefs in the{" "}
              {CAMPAIGN_CONTEXT.folder} folder of {CAMPAIGN_CONTEXT.repoName}.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="block text-sm">
                <span className="font-semibold text-ink">Objective</span>
                <textarea
                  name="objective"
                  defaultValue={campaign.brief.objective}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Audience</span>
                <input
                  name="audience"
                  defaultValue={campaign.brief.audience}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Channels</span>
                <input
                  name="channels"
                  defaultValue={campaign.brief.channels.join(", ")}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Key message</span>
                <input
                  name="keyMessage"
                  defaultValue={campaign.brief.keyMessage}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Success metric</span>
                <input
                  name="successMetric"
                  defaultValue={campaign.brief.successMetric}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Owner</span>
                <input
                  name="owner"
                  defaultValue={campaign.owner}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-ink-soft"
                />
              </label>
            </div>
            <button type="submit" className="btn-primary mt-5">
              Save brief
            </button>
          </form>

          <h2 className="mt-12 font-display text-2xl font-bold">Tasks &amp; milestones</h2>
          <p className="mt-2 text-muted">
            Ordered work for this campaign. Each task shows its owner, acceptance checks, and
            milestone evidence.
          </p>
          <ol className="mt-6 space-y-6">
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskCard task={task} />
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <Link href="/campaigns" className="btn-secondary">
              ← Back to workspace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
