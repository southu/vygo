import type { VibeCodingModule } from "@/content/vibe-coding";

/**
 * One card in the /vibe-coding Topics grid. Available modules link to their
 * route; coming-soon modules render as a plain card with a status badge and
 * no link, so the grid never points at a dead route.
 */
export function TopicCard({ topic }: { topic: VibeCodingModule }) {
  const availableRoute = topic.status === "available" ? topic.route : null;
  const available = availableRoute !== null;

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
      {available ? (
        <p className="mt-4 text-sm font-semibold text-purple">Open module →</p>
      ) : (
        <p className="mt-4 text-sm text-muted">Published here when it ships.</p>
      )}
    </>
  );

  if (availableRoute !== null) {
    return (
      <a
        href={availableRoute}
        className="card block transition-colors hover:border-purple"
        data-status="available"
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
