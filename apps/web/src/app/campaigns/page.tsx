import type { Metadata } from "next";
import Link from "next/link";
import {
  CAMPAIGNS,
  CAMPAIGN_CONTEXT,
  getQueue,
  getTasksForCampaign,
  STAGES,
  WEEKLY_EVIDENCE,
} from "@/content/campaign-workspace";
import { RepoContext } from "@/components/campaign/RepoContext";
import { TaskCard } from "@/components/campaign/TaskCard";

export const metadata: Metadata = {
  title: "Campaign workspace",
  description:
    "Run marketing and product campaigns end-to-end: create briefs, assign owners, track drafting / review / launch readiness with acceptance checks, work a coherent queue, and publish milestone and weekly evidence — all scoped to the vygo folder in southu/vygo.",
};

export default function CampaignWorkspacePage() {
  const queue = getQueue();

  return (
    <main id="main-content" data-page="campaign-workspace">
      {/* Hero + explicit folder/repo context */}
      <section className="section-pad border-b border-border bg-purple-soft/30">
        <div className="container-page">
          <p className="eyebrow">Operators</p>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl" data-workspace-title>
            Campaign workspace
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Run marketing and product campaigns end-to-end — create briefs, assign owners, track
            launch readiness across drafting, review, and launch, work a coherent queue, and publish
            milestone and weekly evidence.
          </p>
          <RepoContext className="mt-6" />
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#queue" className="btn-primary">
              Open the campaign queue
            </a>
            <a href="#stages" className="btn-secondary">
              Launch-readiness stages
            </a>
            <Link href="/campaigns/evidence" className="btn-secondary">
              Weekly evidence summary
            </Link>
          </div>
        </div>
      </section>

      {/* Campaign briefs */}
      <section className="section-pad" id="briefs" data-section="briefs">
        <div className="container-page">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Campaign briefs</h2>
              <p className="mt-2 max-w-2xl text-muted">
                Each brief captures the objective, audience, channels, and success metric. Open one
                to edit its brief and work its tasks.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3" data-brief-list>
            {CAMPAIGNS.map((campaign) => {
              const tasks = getTasksForCampaign(campaign.id);
              return (
                <article
                  key={campaign.id}
                  className="card flex flex-col"
                  data-brief
                  data-campaign-id={campaign.id}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-purple">
                    {STAGES.find((s) => s.id === campaign.stage)?.label ?? campaign.stage} stage
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink">
                    <Link href={`/campaigns/${campaign.id}`} className="hover:text-purple">
                      {campaign.name}
                    </Link>
                  </h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="font-semibold text-ink">Objective</dt>
                      <dd className="text-ink-soft">{campaign.brief.objective}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink">Audience</dt>
                      <dd className="text-ink-soft">{campaign.brief.audience}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink">Channels</dt>
                      <dd className="text-ink-soft">{campaign.brief.channels.join(", ")}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink">Success metric</dt>
                      <dd className="text-ink-soft">{campaign.brief.successMetric}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
                    <span data-brief-owner>
                      <span className="text-muted">Owner: </span>
                      <span className="font-semibold text-ink">{campaign.owner}</span>
                    </span>
                    <span className="text-muted">{tasks.length} tasks</span>
                  </div>
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="mt-4 text-sm font-semibold text-purple hover:text-purple-dark"
                  >
                    Edit brief &amp; view tasks →
                  </Link>
                </article>
              );
            })}
          </div>

          <div className="mt-6">
            <Link href="/campaigns/briefs/new" className="btn-secondary" data-new-brief>
              + Create new campaign brief
            </Link>
          </div>
        </div>
      </section>

      {/* Launch-readiness stages with acceptance checks */}
      <section className="section-pad bg-surface/60" id="stages" data-section="stages">
        <div className="container-page">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Launch readiness</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Work flows through three stages. Each has explicit acceptance checks that must pass
            before a task advances.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-3" data-stage-board>
            {STAGES.map((stage) => {
              const stageTasks = queue.filter((t) => t.stage === stage.id);
              return (
                <div
                  key={stage.id}
                  className="card flex flex-col"
                  data-stage-column
                  data-stage={stage.id}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-semibold text-ink">
                      {stage.order}. {stage.label}
                    </h3>
                    <span className="chip" data-stage-count>
                      {stageTasks.length}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">{stage.summary}</p>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                    Acceptance checks
                  </p>
                  <ul className="mt-2 space-y-1.5" data-stage-acceptance>
                    {stage.acceptanceChecks.map((check) => (
                      <li
                        key={check}
                        className="flex items-start gap-2 text-sm text-ink-soft"
                        data-stage-check
                      >
                        <span aria-hidden className="text-purple">
                          ▸
                        </span>
                        {check}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                    In this stage
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {stageTasks.length > 0 ? (
                      stageTasks.map((t) => (
                        <li key={t.id}>
                          <Link
                            href={`/campaigns/tasks/${t.id}`}
                            className="text-ink-soft hover:text-purple"
                          >
                            #{t.queueOrder} {t.title}
                          </Link>
                        </li>
                      ))
                    ) : (
                      <li className="text-muted">No tasks yet.</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Coherent, ordered campaign queue */}
      <section className="section-pad" id="queue" data-section="queue">
        <div className="container-page">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Campaign queue</h2>
          <p className="mt-2 max-w-2xl text-muted">
            A single ordered work list. Run it top to bottom — every item shows its owner, stage,
            acceptance checks, milestone evidence, and the {CAMPAIGN_CONTEXT.folder} folder /{" "}
            {CAMPAIGN_CONTEXT.repoName} repository it belongs to.
          </p>

          <ol className="mt-8 space-y-6" data-queue>
            {queue.map((task) => (
              <li key={task.id} data-queue-item>
                <TaskCard task={task} />
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Weekly evidence summary (also on its own route) */}
      <section className="section-pad bg-surface/60" id="evidence" data-section="evidence">
        <div className="container-page">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                Weekly evidence summary
              </h2>
              <p className="mt-2 max-w-2xl text-muted">
                Concise, published evidence of what shipped each week across every campaign.
              </p>
            </div>
            <Link
              href="/campaigns/evidence"
              className="hidden shrink-0 text-sm font-semibold text-purple hover:text-purple-dark sm:block"
            >
              Full history →
            </Link>
          </div>

          <div className="mt-8 space-y-6" data-weekly-evidence>
            {WEEKLY_EVIDENCE.map((week) => (
              <article key={week.weekOf} className="card" data-evidence-week={week.weekOf}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-ink">
                    Week of {week.weekOf}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {week.metrics.map((m) => (
                      <span key={m.label} className="chip">
                        {m.label}: <span className="ml-1 font-semibold text-ink">{m.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-ink-soft">{week.headline}</p>
                <ul className="mt-3 space-y-1.5">
                  {week.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm text-ink-soft">
                      <span aria-hidden className="text-green-dark">
                        ✓
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
