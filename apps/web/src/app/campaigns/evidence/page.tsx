import type { Metadata } from "next";
import Link from "next/link";
import {
  CAMPAIGN_TASKS,
  getCampaign,
  WEEKLY_EVIDENCE,
} from "@/content/campaign-workspace";
import { RepoContext } from "@/components/campaign/RepoContext";

export const metadata: Metadata = {
  title: "Weekly evidence summary",
  description:
    "Published weekly evidence summaries and concise per-milestone evidence for every Vygo campaign, scoped to the vygo folder in southu/vygo.",
};

export default function EvidenceSummaryPage() {
  return (
    <main id="main-content" data-page="campaign-evidence">
      <section className="section-pad">
        <div className="container-page">
          <nav className="text-sm text-muted">
            <Link href="/campaigns" className="hover:text-purple">
              Campaign workspace
            </Link>
            <span className="mx-2">/</span>
            <span>Evidence</span>
          </nav>

          <p className="eyebrow mt-6">Evidence</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl" data-evidence-title>
            Weekly evidence summary
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">
            Concise, published evidence of what shipped each week, plus per-milestone evidence across
            every campaign.
          </p>
          <RepoContext className="mt-6" />

          {/* Weekly summaries */}
          <div className="mt-10 space-y-6" data-weekly-evidence>
            {WEEKLY_EVIDENCE.map((week) => (
              <article key={week.weekOf} className="card" data-evidence-week={week.weekOf}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    Week of {week.weekOf}
                  </h2>
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

          {/* Per-milestone evidence */}
          <h2 className="mt-12 font-display text-2xl font-bold">Milestone evidence</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Concise evidence captured for each milestone across the workspace.
          </p>
          <div className="mt-6 space-y-4" data-milestone-evidence-list>
            {CAMPAIGN_TASKS.map((task) => {
              const campaign = getCampaign(task.campaignId);
              return (
                <article
                  key={task.milestone.id}
                  className="card"
                  data-milestone-evidence
                  data-milestone-id={task.milestone.id}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg font-semibold text-ink">
                      {task.milestone.title}
                    </h3>
                    <span className="chip">{campaign?.name ?? task.campaignId}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">{task.milestone.evidence}</p>
                  <p className="mt-2 text-xs text-muted">
                    {task.milestone.captured ? "Evidence captured" : "Evidence pending"} ·{" "}
                    <Link href={`/campaigns/tasks/${task.id}`} className="text-purple hover:text-purple-dark">
                      View task
                    </Link>
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-10">
            <Link href="/campaigns" className="btn-secondary">
              ← Back to workspace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
