import type { VibeCodingModule } from "@/content/vibe-coding";

/**
 * One card in the /vibe-coding Topics grid. Any module with a route links to
 * it — available modules to the full page, coming-soon modules to their stub
 * page — while the badge keeps the publication status visible. Modules with
 * no route yet render as a plain card so the grid never points at a 404.
 */
export function TopicCard({ topic }: { topic: VibeCodingModule }) {
  const href = topic.route;
  const available = topic.status === "available";

  const badge = available ? (
    <span className="chip border-green/40 bg-green/10 text-green-dark" data-status="available">
      Available
    </span>
  ) : (
    <span className="chip border-amber/40 bg-amber/10 text-amber" data-status="coming-soon">
      Coming soon
    </span>
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">{topic.title}</h3>
        {badge}
      </div>
      <p className="mt-2 text-sm text-muted">{topic.blurb}</p>
      {href !== null ? (
        <p className="mt-4 text-sm font-semibold text-purple">
          {available ? "Open module →" : "Read the stub →"}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">Published here when it ships.</p>
      )}
    </>
  );

  if (href !== null) {
    return (
      <a
        href={href}
        className="card block transition-colors hover:border-purple"
        data-status={topic.status}
      >
        {body}
      </a>
    );
  }

  return (
    <div className="card" data-status="coming-soon">
      {body}
    </div>
  );
}
