import { CAMPAIGN_CONTEXT } from "@/content/campaign-workspace";

/**
 * Explicit Vygo folder + repository context. Rendered on every task and at the
 * top of the workspace so contributors always know where the work belongs.
 */
export function RepoContext({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-xs ${className}`}
      data-repo-context
      data-folder={CAMPAIGN_CONTEXT.folder}
      data-repo={CAMPAIGN_CONTEXT.repoName}
    >
      <span className="chip" data-folder-badge>
        Folder: <span className="ml-1 font-semibold text-ink">{CAMPAIGN_CONTEXT.folder}</span>
      </span>
      <a
        href={CAMPAIGN_CONTEXT.repoUrl}
        className="chip hover:border-purple hover:text-purple"
        data-repo-badge
        rel="noreferrer"
      >
        Repo: <span className="ml-1 font-semibold text-ink">{CAMPAIGN_CONTEXT.repoName}</span>
      </a>
    </div>
  );
}
