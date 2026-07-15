"use client";

import { formatOpeningDate } from "@/lib/availability";
import { useAvailability } from "./AvailabilityProvider";

/**
 * Surfaces the next available audit start date on the application form. The value
 * is read from the availability context, which loads it at runtime from the
 * Railway-backed /api/availability endpoint (the `site_availability` singleton) —
 * never a hardcoded frontend constant, so operators change it via
 * `pnpm availability:set` with no redeploy.
 *
 * The banner label always renders (including during the initial availability
 * fetch) so the apply page contract text is present in the served HTML, not only
 * after client hydration. The date value fills in once the DB-backed response
 * arrives.
 */
export function NextAuditStartDate() {
  const { data, isBusy } = useAvailability();
  const date = formatOpeningDate(data?.nextOpeningDate ?? null);
  const display = date ?? (isBusy ? "Loading…" : "Check back soon");
  return (
    <p
      className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink"
      data-testid="apply-next-audit-date"
    >
      Next available audit start date:{" "}
      <span className="font-semibold" data-next-audit-start-date>
        {display}
      </span>
    </p>
  );
}
