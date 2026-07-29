import Link from "next/link";
import { type CampaignTask, getCampaign, STAGES, STATUS_LABEL } from "@/content/campaign-workspace";
import { RepoContext } from "./RepoContext";

const STATUS_STYLE: Record<CampaignTask["status"], string> = {
  todo: "border-border bg-surface text-ink-soft",
  in_progress: "border-purple/40 bg-purple-soft text-purple-dark",
  blocked: "border-red-300 bg-red-50 text-red-700",
  done: "border-green/40 bg-green-soft text-green-dark",
};

/**
 * A single ordered work item in the campaign queue. Always displays its owner,
 * stage, acceptance checks, milestone evidence, and the folder/repo context.
 */
export function TaskCard({ task }: { task: CampaignTask }) {
  const campaign = getCampaign(task.campaignId);
  const stage = STAGES.find((s) => s.id === task.stage);

  return (
    <article
      className="card"
      data-task
      data-task-id={task.id}
      data-queue-order={task.queueOrder}
      data-stage={task.stage}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white"
            data-queue-position
            aria-label={`Queue position ${task.queueOrder}`}
          >
            {task.queueOrder}
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">
              <Link href={`/campaigns/tasks/${task.id}`} className="hover:text-purple">
                {task.title}
              </Link>
            </h3>
            <p className="text-xs text-muted">
              {campaign?.name ?? task.campaignId} · {stage?.label ?? task.stage} stage
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[task.status]}`}
          data-task-status={task.status}
        >
          {STATUS_LABEL[task.status]}
        </span>
      </div>

      <p className="mt-3 text-sm text-ink-soft">{task.brief}</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div data-task-owner>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Owner</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">
            {task.owner}
            <span className="ml-1 font-normal text-muted">· {task.ownerRole}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Stage</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{stage?.label ?? task.stage}</dd>
        </div>
      </dl>

      <div className="mt-4" data-acceptance-checks>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Acceptance checks
        </p>
        <ul className="mt-2 space-y-1.5">
          {task.acceptanceChecks.map((check) => (
            <li key={check.label} className="flex items-start gap-2 text-sm" data-acceptance-check>
              <span aria-hidden className={check.done ? "text-green-dark" : "text-muted"}>
                {check.done ? "✓" : "○"}
              </span>
              <span className={check.done ? "text-ink-soft line-through" : "text-ink-soft"}>
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className="mt-4 rounded-lg border border-border bg-canvas/60 p-3"
        data-milestone-evidence
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Milestone evidence · {task.milestone.title}
        </p>
        <p className="mt-1 text-sm text-ink-soft">{task.milestone.evidence}</p>
      </div>

      <RepoContext className="mt-4 border-t border-border pt-4" />
    </article>
  );
}
