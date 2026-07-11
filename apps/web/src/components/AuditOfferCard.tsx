import { CtaLink } from "./CtaLink";

type AuditOfferCardProps = {
  eyebrow: string;
  heading: string;
  body: string;
  priceLine: string;
  deliverables: readonly string[];
  cta: { label: string; href: string };
};

export function AuditOfferCard({
  eyebrow,
  heading,
  body,
  priceLine,
  deliverables,
  cta,
}: AuditOfferCardProps) {
  return (
    <section className="overflow-hidden rounded-card bg-trust text-white shadow-card">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:p-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-green">{eyebrow}</p>
          <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{heading}</h2>
          <p className="mt-4 text-base leading-relaxed text-white/80">{body}</p>
          <p className="mt-6 text-xl font-semibold text-green">{priceLine}</p>
          <CtaLink href={cta.href} variant="on-dark" className="mt-6">
            {cta.label}
          </CtaLink>
        </div>
        <div>
          <p className="text-sm font-semibold text-white/90">Deliverables</p>
          <ul className="mt-4 space-y-2">
            {deliverables.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-white/75">
                <span className="text-green" aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
