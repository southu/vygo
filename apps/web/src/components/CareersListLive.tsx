"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import type { CareerRole } from "@/content/careers";
import { RoleCard } from "@/components/RoleCard";
import { CtaLink } from "@/components/CtaLink";
import { ctas, ctaHrefs } from "@/content/ctas";

/** Shape returned by GET /api/roles (open roles only; no description field). */
type ApiRole = Pick<CareerRole, "id" | "title" | "location" | "type" | "summary" | "status">;

/**
 * Public careers list, hydrated from the live job board.
 *
 * The site is a static export, so the server shell renders the build-time seed
 * roles (SEO + no-JS baseline). On mount we refresh from GET /api/roles — the
 * same source the admin creates roles in — so admin-created roles appear and
 * closed roles drop off without a rebuild. If the fetch fails we keep the
 * server-rendered seed list.
 */
export function CareersListLive({ initialRoles }: { initialRoles: CareerRole[] }) {
  const [roles, setRoles] = useState<CareerRole[]>(initialRoles);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/roles"), {
          headers: { accept: "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        const live = (data as ApiRole[])
          .filter((r) => r && typeof r.id === "string" && typeof r.title === "string")
          .map((r) => ({
            id: r.id,
            title: r.title,
            location: r.location ?? "",
            type: r.type ?? "",
            summary: r.summary ?? "",
            description: "",
            status: r.status ?? "open",
          }));
        setRoles(live);
      } catch {
        /* keep the server-rendered seed list on any network/parse error */
      }
    })();
    return () => controller.abort();
  }, []);

  if (roles.length === 0) {
    return (
      <div className="mt-10 card max-w-2xl" data-testid="roles-empty">
        <h2 className="font-display text-xl font-semibold">No open roles right now</h2>
        <p className="mt-3 text-sm text-muted">
          We don&apos;t have any open positions at the moment, but we&apos;re always glad to hear
          from exceptional engineers, designers, and operators.
        </p>
        <div className="mt-6">
          <CtaLink href={ctaHrefs.waitlist}>{ctas.applyNextOpening}</CtaLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="roles-list">
      {roles.map((role) => (
        <RoleCard key={role.id} role={role} />
      ))}
    </div>
  );
}
