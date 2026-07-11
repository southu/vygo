type PainCardProps = {
  title: string;
  body: string;
};

export function PainCard({ title, body }: PainCardProps) {
  return (
    <article className="card rail h-full">
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </article>
  );
}
