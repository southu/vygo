import Link from "next/link";
import { formatEmploymentType, type CareerRole } from "@/content/careers";

type RoleCardProps = {
  role: CareerRole;
};

/** Public careers list entry: title, location, employment type, and a summary. */
export function RoleCard({ role }: RoleCardProps) {
  return (
    <article className="card h-full" data-testid="role-card" data-role-id={role.id}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
        <span data-role-location>{role.location}</span>
        <span aria-hidden="true">·</span>
        <span data-role-type>{formatEmploymentType(role.type)}</span>
      </div>
      <h3 className="mt-2 font-display text-lg font-semibold text-ink">
        <Link href={`/careers/${role.id}`} className="hover:text-purple" data-role-title>
          {role.title}
        </Link>
      </h3>
      <p className="mt-3 text-sm text-muted" data-role-summary>
        {role.summary}
      </p>
      <p className="mt-4">
        <Link
          href={`/careers/${role.id}`}
          className="text-sm font-semibold text-purple hover:text-purple-dark"
        >
          View role &amp; apply →
        </Link>
      </p>
    </article>
  );
}
