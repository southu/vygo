"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { formatEmploymentType } from "@/content/careers";
import { site } from "@/content/site";
import { ctas, ctaHrefs } from "@/content/ctas";
import { CtaLink } from "@/components/CtaLink";
import { RoleApplyForm } from "@/components/RoleApplyForm";

/**
 * Client-rendered role detail for roles that have no build-time static page —
 * i.e. roles an admin created at runtime. vercel.json rewrites any
 * `/careers/:id` that doesn't match a pre-rendered seed page to this route
 * (the URL bar still shows /careers/:id). We read the id from the path and
 * fetch GET /api/roles/:id, then render the same surface as the static detail
 * page: title + description + apply form for open roles, a graceful closed
 * state otherwise, and a not-found state for unknown ids.
 */

type ApiRoleDetail = {
  id: string;
  title: string;
  location: string;
  type: string;
  summary: string;
  description: string;
  status: "open" | "closed";
};

type LoadState = "loading" | "open" | "closed" | "notfound" | "error";

/** Extract the role id from `/careers/:id` (the visible, un-rewritten path). */
function roleIdFromPath(): string {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("careers");
  const raw = i >= 0 ? parts[i + 1] : undefined;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Careers</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function BackLink() {
  return (
    <div className="mt-10 border-t border-border pt-6">
      <Link href="/careers" className="text-sm font-semibold text-purple hover:text-purple-dark">
        ← Back to all roles
      </Link>
    </div>
  );
}

export default function CareersRoleFallbackPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [role, setRole] = useState<ApiRoleDetail | null>(null);

  useEffect(() => {
    const id = roleIdFromPath();
    if (!id) {
      setState("notfound");
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/roles/${encodeURIComponent(id)}`), {
          headers: { accept: "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (res.status === 404) {
          setState("notfound");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = (await res.json()) as ApiRoleDetail;
        setRole(data);
        setState(data.status === "open" ? "open" : "closed");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      }
    })();
    return () => controller.abort();
  }, []);

  if (state === "loading") {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Loading role…</h1>
        <p className="mt-4 text-sm text-muted" data-testid="role-detail-loading">
          Fetching the latest role details.
        </p>
      </Shell>
    );
  }

  if (state === "notfound") {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Role not found</h1>
        <p className="mt-4 text-sm text-muted" data-testid="role-not-found">
          We couldn&apos;t find that role. It may have been removed.
        </p>
        <BackLink />
      </Shell>
    );
  }

  if (state === "error") {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Something went wrong</h1>
        <p className="mt-4 text-sm text-muted" data-testid="role-detail-error">
          We couldn&apos;t load this role right now. Please try again in a moment.
        </p>
        <BackLink />
      </Shell>
    );
  }

  if (!role) return null;

  if (state === "closed") {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">{role.title}</h1>
        <div
          className="mt-8 rounded-card border border-border bg-surface p-6"
          data-testid="role-closed"
        >
          <h2 className="font-display text-xl font-semibold text-ink">
            This role is no longer open
          </h2>
          <p className="mt-3 text-sm text-muted">
            Thanks for your interest in the {role.title} role. We&apos;re no longer accepting
            applications for this position, but new roles open regularly.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <CtaLink href="/careers" variant="secondary">
              See all open roles
            </CtaLink>
            <CtaLink href={ctaHrefs.waitlist}>{ctas.applyNextOpening}</CtaLink>
          </div>
        </div>
        <BackLink />
      </Shell>
    );
  }

  const paragraphs = (role.description ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main id="main-content">
      <article className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Careers</p>
          <h1
            className="mt-4 font-display text-4xl font-bold sm:text-5xl"
            data-testid="role-detail-title"
          >
            {role.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-ink-soft">
            <span data-role-location>{role.location}</span>
            <span aria-hidden="true">·</span>
            <span data-role-type>{formatEmploymentType(role.type)}</span>
          </div>

          <div className="prose-page mt-8" data-testid="role-detail-description">
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
            ) : (
              <p>{role.summary}</p>
            )}
          </div>

          <div
            id="apply"
            className="mt-12 rounded-card border border-purple/30 bg-purple-soft/30 p-6 sm:p-8"
            data-testid="role-apply"
          >
            <h2 className="font-display text-2xl font-bold text-ink">Apply for this role</h2>
            <p className="mt-3 text-sm text-muted">
              Tell us a little about yourself and why the {role.title} role is a fit. A member of
              the {site.name} team reviews every application.
            </p>
            <div className="mt-6">
              <RoleApplyForm roleId={role.id} roleTitle={role.title} />
            </div>
          </div>

          <BackLink />
        </div>
      </article>
    </main>
  );
}
