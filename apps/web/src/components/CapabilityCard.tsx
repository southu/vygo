type CapabilityCardProps = {
  title: string;
  body: string;
};

export function CapabilityCard({ title, body }: CapabilityCardProps) {
  return (
    <article className="card h-full">
      <div className="mb-3 h-1 w-8 rounded-full bg-purple" aria-hidden="true" />
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </article>
  );
}
