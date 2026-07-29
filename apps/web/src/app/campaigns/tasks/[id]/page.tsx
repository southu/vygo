import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CAMPAIGN_CONTEXT,
  CAMPAIGN_TASKS,
  getCampaign,
  getTask,
  STAGES,
  STATUS_LABEL,
} from "@/content/campaign-workspace";
import { RepoContext } from "@/components/campaign/RepoContext";

export function generateStaticParams() {
  return CAMPAIGN_TASKS.map((t) => ({ id: t.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const task = getTask(id);
  return {
    title: task ? `${task.title} · Campaign task` : "Campaign task",
    description: task
      ? `${task.title} — owner ${task.owner}, ${task.stage} stage. In the ${CAMPAIGN_CONTEXT.folder} folder of ${CAMPAIGN_CONTEXT.repoName}.`
      : "Campaign task detail.",
  };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) notFound();

  const campaign = getCampaign(task.campaignId);
  const stage = STAGES.find((s) => s.id === task.stage);

  return (
    <main id="main-content" data-page="campaign-task" data-task-id={task.id}>
      <section className="section-pad">
        <div className="container-page max-w-3xl">
          <nav className="text-sm text-muted">
            <Link href="/campaigns" className="hover:text-purple">
              Campaign workspace
            </Link>
            <span className="mx-2">/</span>
            <Link href={`/campaigns/${task.campaignId}`} className="hover:text-purple">
              {campaign?.name ?? task.campaignId}
            </Link>
            <span className="mx-2">/</span>
            <span>Task #{task.queueOrder}</span>
          </nav>

          <p className="eyebrow mt-6">{stage?.label ?? task.stage} stage</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl" data-task-title>
            {task.title}
          </h1>
          <p className="mt-3 text-lg text-muted">{task.brief}</p>

          {/* Explicit owner + folder/repo context on the task detail view */}
          <div className="card mt-8 grid gap-4 sm:grid-cols-2">
            <div data-task-owner>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Owner</p>
              <p className="mt-1 text-base font-semibold text-ink">{task.owner}</p>
              <p className="text-sm text-muted">{task.ownerRole}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Status</p>
              <p className="mt-1 text-base font-semibold text-ink">{STATUS_LABEL[task.status]}</p>
              <p className="text-sm text-muted">Queue position #{task.queueOrder}</p>
            </div>
            <div className="sm:col-span-2 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Folder &amp; repository
              </p>
              <RepoContext className="mt-2" />
            </div>
          </div>

          {/* Acceptance checks */}
          <div className="card mt-6" data-acceptance-checks>
            <h2 className="font-display text-xl font-semibold">Acceptance checks</h2>
            <ul className="mt-4 space-y-2">
              {task.acceptanceChecks.map((check) => (
                <li key={check.label} className="flex items-start gap-2" data-acceptance-check>
                  <span aria-hidden className={check.done ? "text-green-dark" : "text-muted"}>
                    {check.done ? "✓" : "○"}
                  </span>
                  <span className="text-ink-soft">{check.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Milestone evidence */}
          <div className="card mt-6" data-milestone-evidence>
            <h2 className="font-display text-xl font-semibold">
              Milestone evidence · {task.milestone.title}
            </h2>
            <p className="mt-3 text-ink-soft">{task.milestone.evidence}</p>
            <p className="mt-2 text-sm text-muted">
              {task.milestone.captured ? "Evidence captured" : "Evidence pending"}
            </p>
          </div>

          <div className="mt-8">
            <Link href="/campaigns#queue" className="btn-secondary">
              ← Back to the queue
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
