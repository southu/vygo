/**
 * Job-board foundation for the marketing edge (www.vygo.ai).
 *
 * Storage model: the marketing edge (Vercel) has no local DATABASE_URL of its
 * own (see ../_lib/store.ts) and the Railway API exposes no job-board routes, so
 * this module keeps a process-local store seeded at module load. Role postings
 * are seeded deterministically so GET /api/roles is always non-empty; created
 * applications and admin mutations live in the warm serverless instance. This
 * introduces no new cloud infrastructure — it reuses the same "durable when a
 * DATABASE_URL is present, in-memory fallback otherwise" shape the waitlist/apply
 * edge functions already use, minus the Postgres dependency the edge lacks here.
 *
 * Never returns secrets, connection strings, or applicant PII beyond what the
 * submitter provided on the same request.
 */
import { randomUUID } from "node:crypto";

export type RoleStatus = "open" | "closed";
export type ApplicationStatus = "new" | "reviewed" | "decided";

export interface Role {
  id: string;
  title: string;
  location: string;
  type: string;
  /** One-line teaser shown on the public careers list (GET /api/roles). */
  summary: string;
  description: string;
  status: RoleStatus;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  role_id: string;
  name: string;
  email: string;
  resume: string | null;
  cover_note: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

/** Ordered status lifecycle for applications: new -> reviewed -> decided. */
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ["new", "reviewed", "decided"];

/**
 * Seed roles. Deterministic ids + timestamps so the public list endpoint returns
 * a stable, non-empty array on every cold start. At least one role is OPEN.
 */
const SEED_ROLES: readonly Role[] = [
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
    created_at: "2026-01-06T09:00:00.000Z",
    updated_at: "2026-01-06T09:00:00.000Z",
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
    created_at: "2026-01-13T09:00:00.000Z",
    updated_at: "2026-01-13T09:00:00.000Z",
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
    created_at: "2026-01-20T09:00:00.000Z",
    updated_at: "2026-01-20T09:00:00.000Z",
  },
  {
    // Seeded closed role: excluded from GET /api/roles and the public careers
    // list, but readable via GET /api/roles/:id so the detail page can render its
    // graceful "no longer open" state. Kept deterministic for verification.
    id: "developer-advocate",
    title: "Developer Advocate",
    location: "Remote (US)",
    type: "full-time",
    summary: "Grow the Vygo developer community through content, docs, and hands-on education.",
    description:
      "Grow the Vygo developer community through content, documentation, and hands-on education. You would have partnered with engineering and go-to-market to make the Ratchet build-and-verify loop approachable for teams shipping AI-built software.",
    status: "closed",
    created_at: "2025-12-02T09:00:00.000Z",
    updated_at: "2026-01-27T09:00:00.000Z",
  },
];

/** Process-local stores, seeded at module load. Warm across invocations of this function. */
const roles = new Map<string, Role>(SEED_ROLES.map((r) => [r.id, { ...r }]));
const applications = new Map<string, Application>();

function nowIso(): string {
  return new Date().toISOString();
}

function nullIfEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

// --- Public serializers -----------------------------------------------------

/** Compact list item for GET /api/roles (open roles only). */
export function toRoleListItem(
  role: Role,
): Pick<Role, "id" | "title" | "location" | "type" | "summary" | "status"> {
  return {
    id: role.id,
    title: role.title,
    location: role.location,
    type: role.type,
    summary: role.summary,
    status: role.status,
  };
}

/** Full role for GET /api/roles/:id — includes description + timestamps. */
export function toRoleDetail(role: Role): Role & { created: string; updated: string } {
  return { ...role, created: role.created_at, updated: role.updated_at };
}

export function toApplicationPublic(app: Application): Application {
  return { ...app };
}

// --- Role queries / mutations -----------------------------------------------

/** Open roles only, ordered by creation time (seed order). */
export function listOpenRoles(): Role[] {
  return [...roles.values()].filter((r) => r.status === "open");
}

/** All roles regardless of status (admin listing). */
export function listAllRoles(): Role[] {
  return [...roles.values()];
}

export function getRole(id: string): Role | null {
  const role = roles.get(id.trim());
  return role ? { ...role } : null;
}

export type RoleInput = {
  title?: unknown;
  location?: unknown;
  type?: unknown;
  summary?: unknown;
  description?: unknown;
  status?: unknown;
};

function coerceStatus(value: unknown, fallback: RoleStatus): RoleStatus {
  return value === "closed" ? "closed" : value === "open" ? "open" : fallback;
}

/** First sentence (or a trimmed prefix) of a description, for a list teaser. */
function deriveSummary(description: string): string {
  const trimmed = description.trim();
  if (trimmed === "") return "";
  const sentenceEnd = trimmed.search(/[.!?](\s|$)/);
  const firstSentence = sentenceEnd >= 0 ? trimmed.slice(0, sentenceEnd + 1) : trimmed;
  return firstSentence.length > 200 ? `${firstSentence.slice(0, 197).trimEnd()}…` : firstSentence;
}

/** Create a role (admin). Missing string fields default to safe empty-ish values. */
export function createRole(input: RoleInput): Role {
  const ts = nowIso();
  const description = nullIfEmpty(input.description) ?? "";
  const role: Role = {
    id: `role-${randomUUID()}`,
    title: nullIfEmpty(input.title) ?? "Untitled role",
    location: nullIfEmpty(input.location) ?? "Remote",
    type: nullIfEmpty(input.type) ?? "full-time",
    summary: nullIfEmpty(input.summary) ?? deriveSummary(description),
    description,
    status: coerceStatus(input.status, "open"),
    created_at: ts,
    updated_at: ts,
  };
  roles.set(role.id, role);
  return { ...role };
}

/** Patch a role (admin). Returns null when the id is unknown. */
export function updateRole(id: string, input: RoleInput): Role | null {
  const role = roles.get(id.trim());
  if (!role) return null;
  if (nullIfEmpty(input.title) != null) role.title = nullIfEmpty(input.title) as string;
  if (nullIfEmpty(input.location) != null) role.location = nullIfEmpty(input.location) as string;
  if (nullIfEmpty(input.type) != null) role.type = nullIfEmpty(input.type) as string;
  if (nullIfEmpty(input.summary) != null) role.summary = nullIfEmpty(input.summary) as string;
  if (typeof input.description === "string") role.description = input.description;
  if (input.status === "open" || input.status === "closed") role.status = input.status;
  role.updated_at = nowIso();
  return { ...role };
}

/** Close a role (admin): set status 'closed'. Returns null when unknown. */
export function closeRole(id: string): Role | null {
  const role = roles.get(id.trim());
  if (!role) return null;
  role.status = "closed";
  role.updated_at = nowIso();
  return { ...role };
}

// --- Application queries / mutations ----------------------------------------

export type ApplicationInput = {
  name?: unknown;
  email?: unknown;
  resume?: unknown;
  cover_note?: unknown;
  coverNote?: unknown;
};

export type ApplicationValidation =
  | { ok: true; name: string; email: string; resume: string; coverNote: string | null }
  | { ok: false; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a public application submission. name, email, and resume are required;
 * resume accepts either a link URL or pasted resume text (any non-empty string).
 */
export function validateApplication(body: ApplicationInput): ApplicationValidation {
  const name = nullIfEmpty(body.name);
  const email = nullIfEmpty(body.email);
  const resume = nullIfEmpty(body.resume);
  if (!name) return { ok: false, message: "Field 'name' is required." };
  if (!email) return { ok: false, message: "Field 'email' is required." };
  if (!EMAIL_RE.test(email))
    return { ok: false, message: "Field 'email' must be a valid email address." };
  if (!resume)
    return {
      ok: false,
      message: "Field 'resume' is required — add a resume link or paste your resume text.",
    };
  return {
    ok: true,
    name,
    email,
    resume,
    coverNote: nullIfEmpty(body.cover_note) ?? nullIfEmpty(body.coverNote),
  };
}

/** Create an application against an existing role. status is always 'new'. */
export function createApplication(
  roleId: string,
  value: { name: string; email: string; resume: string | null; coverNote: string | null },
): Application {
  const ts = nowIso();
  const app: Application = {
    id: randomUUID(),
    role_id: roleId,
    name: value.name,
    email: value.email,
    resume: value.resume,
    cover_note: value.coverNote,
    status: "new",
    created_at: ts,
    updated_at: ts,
  };
  applications.set(app.id, app);
  return { ...app };
}

/** All applications, newest first, optionally filtered by role. */
export function listApplications(roleId?: string): Application[] {
  const all = [...applications.values()];
  const filtered = roleId ? all.filter((a) => a.role_id === roleId) : all;
  return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => ({ ...a }));
}

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return value === "new" || value === "reviewed" || value === "decided";
}

/** Update an application's status (admin). Returns null when the id is unknown. */
export function updateApplicationStatus(id: string, status: ApplicationStatus): Application | null {
  const app = applications.get(id.trim());
  if (!app) return null;
  app.status = status;
  app.updated_at = nowIso();
  return { ...app };
}
