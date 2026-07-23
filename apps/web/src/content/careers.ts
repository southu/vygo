/**
 * Public careers content for the marketing site.
 *
 * The site is a static export (see next.config.ts: `output: "export"`), so the
 * careers list and role-detail pages are generated at build time. Their data is
 * a deterministic mirror of the edge job-board seed in `api/_lib/jobs.ts`
 * (SEED_ROLES) — the marketing edge is a separate deployment that cannot import
 * these workspace sources, following the same "the edge mirrors, it does not
 * import" convention used by `api/_lib/validation.ts`.
 *
 * Because both sides derive from identical seed data, the statically rendered
 * careers pages match what GET /api/roles / GET /api/roles/:id serve at runtime:
 * open roles appear on the list, and the closed role is excluded from the list
 * but still resolvable on its detail page (rendered as a graceful closed state).
 *
 * Keep this in sync with SEED_ROLES in api/_lib/jobs.ts.
 */

export type RoleStatus = "open" | "closed";

export interface CareerRole {
  id: string;
  title: string;
  location: string;
  /** Employment type, e.g. "full-time" or "contract". */
  type: string;
  /** One-line teaser used on the careers list. */
  summary: string;
  description: string;
  status: RoleStatus;
}

const ROLES: readonly CareerRole[] = [
  {
    id: "founding-full-stack-engineer",
    title: "Founding Full-Stack Engineer",
    location: "Remote (US)",
    type: "full-time",
    summary:
      "Own product surfaces end to end across our TypeScript monorepo — marketing web, edge API, and worker.",
    description:
      "Own product surfaces end to end across our TypeScript monorepo — marketing web, edge API, and worker. You will ship the features that turn Vygo's readiness product into a durable business, working directly with the founders on architecture, DX, and reliability.",
    status: "open",
  },
  {
    id: "qa-uat-lead",
    title: "QA & UAT Lead",
    location: "Day one · shared resource",
    type: "",
    summary:
      "Quality is part of every Vygo engagement by default from day one — never billed separately. The QA & UAT Lead owns test planning, builds and runs both automated and manual QA, coordinates user acceptance testing (UAT) with your stakeholders, and holds release sign-off before each launch.",
    description:
      "Quality is part of every Vygo engagement by default from day one — included as a shared resource across the delivery team, never billed separately or handed to anyone less experienced. The QA & UAT Lead owns the test plan for the rebuild, builds and maintains automated test coverage alongside targeted manual QA, and coordinates user acceptance testing (UAT) with your stakeholders so the people who will live with the product confirm it works. Before anything reaches production, the QA & UAT Lead holds release sign-off — the final quality gate on every launch.",
    status: "open",
  },
  {
    id: "product-designer",
    title: "Product Designer",
    location: "Remote (US/EU)",
    type: "contract",
    summary:
      "Shape the end-to-end experience of the Vygo readiness assessment and results surfaces.",
    description:
      "Shape the end-to-end experience of the Vygo readiness assessment and results surfaces. You will partner with engineering to move quickly from prototype to production, owning the visual and interaction system that makes complex readiness data feel effortless.",
    status: "open",
  },
  {
    id: "gtm-lead",
    title: "Go-to-Market Lead",
    location: "Remote (US)",
    type: "full-time",
    summary:
      "Build Vygo's go-to-market motion from first principles: positioning, lifecycle, and the early sales playbook.",
    description:
      "Build the go-to-market motion for Vygo from first principles: positioning, lifecycle, and the early sales playbook. You will own the pipeline from first touch through activation and work closely with the founders on messaging and pricing.",
    status: "open",
  },
  {
    id: "developer-advocate",
    title: "Developer Advocate",
    location: "Remote (US)",
    type: "full-time",
    summary: "Grow the Vygo developer community through content, docs, and hands-on education.",
    description:
      "Grow the Vygo developer community through content, documentation, and hands-on education. You would have partnered with engineering and go-to-market to make the Ratchet build-and-verify loop approachable for teams shipping AI-built software.",
    status: "closed",
  },
];

/** All roles, open and closed (used to pre-render every detail page). */
export function listAllRoles(): CareerRole[] {
  return [...ROLES];
}

/** Open roles only — the public careers list, mirroring GET /api/roles. */
export function listOpenRoles(): CareerRole[] {
  return ROLES.filter((role) => role.status === "open");
}

/** One role by id, regardless of status. Returns null when unknown. */
export function getRole(id: string): CareerRole | null {
  return ROLES.find((role) => role.id === id) ?? null;
}

/** Human-friendly employment type label (e.g. "full-time" -> "Full-time"). */
export function formatEmploymentType(type: string): string {
  const trimmed = type.trim();
  if (trimmed === "") return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
