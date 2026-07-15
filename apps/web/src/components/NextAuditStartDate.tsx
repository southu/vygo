"use client";

import { formatOpeningDate } from "@/lib/availability";
import { useAvailability } from "./AvailabilityProvider";

/**
 * Surfaces the next available audit start date on the application form. The value
 * is read from the availability context, which loads it at runtime from the
 * Railway-backed /api/availability endpoint (the `site_availability` singleton) —
 * never a hardcoded frontend constant, so operators change it via
 * `pnpm availability:set` with no redeploy. Renders nothing until a DB-supplied
 * date is available (loading/error states stay silent so the form is unaffected).
 */
export function NextAuditStartDate() {
  const { data } = useAvailability();
  const date = formatOpeningDate(data?.nextOpeningDate ?? null);
  if (!date) return null;
  return (
    <p
      className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink"
      data-testid="apply-next-audit-date"
    >
      Next available audit start date:{" "}
      <span className="font-semibold" data-next-audit-start-date>
        {date}
      </span>
    </p>
  );
}
