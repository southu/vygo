type OpsPlanCardProps = {
  name: string;
  price: string;
  includes?: readonly string[];
};

export function OpsPlanCard({ name, price, includes }: OpsPlanCardProps) {
  return (
    <article className="card h-full">
      <h3 className="font-display text-lg font-semibold text-ink">{name}</h3>
      <p className="mt-2 text-xl font-bold text-purple">{price}</p>
      {includes ? (
        <ul className="mt-4 space-y-2">
          {includes.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-muted">
              <span className="text-green-dark" aria-hidden="true">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
