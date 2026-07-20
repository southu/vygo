/**
 * Server-rendered admin HTML for the job-board review surface (/admin/*).
 *
 * These pages are rendered by the same edge function (api/jobs.ts) that serves
 * the JSON internal API, so they read the same warm-instance store and are
 * guarded by the same ops Basic-Auth gate. Rendering on the server (rather than
 * the client-only /ops/jobs surface) means the applicant name, email, submitted
 * date, status, resume and cover note appear directly in the HTML — an admin (or
 * an automated check) can read the review surface without executing client JS.
 *
 * Every applicant-supplied value is HTML-escaped before it reaches the markup.
 */
import type { Application } from "./jobs.js";

export type AdminRoleRow = {
  id: string;
  title: string;
  location: string;
  type: string;
  status: string;
  application_count: number;
};

/** HTML-escape text for safe interpolation into element content or attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttpLink(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** YYYY-MM-DD for an ISO timestamp; falls back to the raw value if unparseable. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    margin: 0; padding: 2rem; line-height: 1.5; color: #1a1a2e; background: #f7f7fb; }
  main { max-width: 900px; margin: 0 auto; }
  a { color: #6d28d9; }
  h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem;
    font-weight: 700; color: #6d28d9; margin: 0 0 0.5rem; }
  .muted { color: #555; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.25rem; background: #fff;
    border: 1px solid #e5e5ef; border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid #eee; font-size: 0.92rem; }
  th { background: #f0f0f7; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:last-child td { border-bottom: 0; }
  .badge { display: inline-block; border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.78rem;
    font-weight: 600; background: #ede9fe; color: #5b21b6; }
  dl { background: #fff; border: 1px solid #e5e5ef; border-radius: 12px; padding: 1rem 1.25rem; margin-top: 1.25rem; }
  dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-top: 0.9rem; }
  dt:first-child { margin-top: 0; }
  dd { margin: 0.2rem 0 0; white-space: pre-wrap; word-break: break-word; }
  nav { margin-bottom: 1rem; font-size: 0.9rem; }
`;

function layout(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main id="main-content">
${inner}
</main>
</body>
</html>`;
}

/** Admin roles list with per-role application counts. */
export function renderRolesListPage(roles: AdminRoleRow[]): string {
  const rows = roles
    .map(
      (
        r,
      ) => `      <tr data-testid="admin-role-row" data-role-id="${escapeHtml(r.id)}" data-role-status="${escapeHtml(r.status)}">
        <td><a href="/admin/roles/${encodeURIComponent(r.id)}/applications">${escapeHtml(r.title)}</a></td>
        <td>${escapeHtml(r.location)} · ${escapeHtml(r.type)}</td>
        <td><span class="badge">${escapeHtml(r.status)}</span></td>
        <td data-testid="admin-role-application-count" data-count="${r.application_count}">${r.application_count}</td>
      </tr>`,
    )
    .join("\n");

  const inner = `<p class="eyebrow">Internal admin</p>
<h1>Job roles &amp; applications</h1>
<p class="muted">Signed in as admin. Per-role application counts below — open a role to review its applications.</p>
<table data-testid="admin-roles-table">
  <thead>
    <tr><th>Role</th><th>Location / type</th><th>Status</th><th>Applications</th></tr>
  </thead>
  <tbody>
${rows || '      <tr><td colspan="4" class="muted">No roles.</td></tr>'}
  </tbody>
</table>`;
  return layout("Admin · Job roles", inner);
}

/** Per-role applications list: name, email, submitted date, status. */
export function renderRoleApplicationsPage(
  role: { id: string; title: string } | null,
  apps: Application[],
): string {
  if (!role) {
    return layout(
      "Admin · Role not found",
      `<nav><a href="/admin/roles">← All roles</a></nav>
<h1>Role not found</h1>
<p class="muted">No role matches that id.</p>`,
    );
  }
  const rows = apps
    .map(
      (
        a,
      ) => `      <tr data-testid="admin-application-row" data-application-id="${escapeHtml(a.id)}" data-application-status="${escapeHtml(a.status)}">
        <td data-testid="admin-application-name"><a href="/admin/applications/${encodeURIComponent(a.id)}">${escapeHtml(a.name)}</a></td>
        <td data-testid="admin-application-email">${escapeHtml(a.email)}</td>
        <td data-testid="admin-application-submitted">${escapeHtml(formatDate(a.created_at))}</td>
        <td><span class="badge" data-testid="admin-application-status">${escapeHtml(a.status)}</span></td>
      </tr>`,
    )
    .join("\n");

  const inner = `<nav><a href="/admin/roles">← All roles</a></nav>
<p class="eyebrow">Applications</p>
<h1>${escapeHtml(role.title)}</h1>
<p class="muted">${apps.length} application${apps.length === 1 ? "" : "s"} submitted for this role.</p>
<table data-testid="admin-applications-table">
  <thead>
    <tr><th>Applicant</th><th>Email</th><th>Submitted</th><th>Status</th></tr>
  </thead>
  <tbody>
${rows || '      <tr><td colspan="4" class="muted">No applications submitted yet.</td></tr>'}
  </tbody>
</table>`;
  return layout(`Admin · ${role.title} applications`, inner);
}

/** Full application detail: resume link/text and cover note. */
export function renderApplicationDetailPage(app: Application | null): string {
  if (!app) {
    return layout(
      "Admin · Application not found",
      `<nav><a href="/admin/roles">← All roles</a></nav>
<h1>Application not found</h1>
<p class="muted">No application matches that id.</p>`,
    );
  }

  const resume = app.resume ?? "";
  const resumeBlock = resume
    ? isHttpLink(resume)
      ? `<a href="${escapeHtml(resume)}" target="_blank" rel="noopener noreferrer" data-testid="admin-application-resume-link">${escapeHtml(resume)}</a>`
      : `<span data-testid="admin-application-resume-text">${escapeHtml(resume)}</span>`
    : `<span class="muted">No resume provided.</span>`;

  const coverBlock = app.cover_note
    ? `<span data-testid="admin-application-cover-note">${escapeHtml(app.cover_note)}</span>`
    : `<span class="muted">No cover note provided.</span>`;

  const inner = `<nav><a href="/admin/roles/${encodeURIComponent(app.role_id)}/applications">← ${escapeHtml(app.role_id)} applications</a></nav>
<p class="eyebrow">Application</p>
<h1 data-testid="admin-application-detail-name">${escapeHtml(app.name)}</h1>
<dl data-testid="admin-application-detail">
  <dt>Name</dt><dd>${escapeHtml(app.name)}</dd>
  <dt>Email</dt><dd>${escapeHtml(app.email)}</dd>
  <dt>Role</dt><dd>${escapeHtml(app.role_id)}</dd>
  <dt>Submitted</dt><dd>${escapeHtml(formatDate(app.created_at))}</dd>
  <dt>Status</dt><dd><span class="badge" data-testid="admin-application-status">${escapeHtml(app.status)}</span></dd>
  <dt>Resume</dt><dd>${resumeBlock}</dd>
  <dt>Cover note</dt><dd>${coverBlock}</dd>
</dl>`;
  return layout(`Admin · ${app.name}`, inner);
}

/**
 * 401 gate page for the admin HTML surface. When no production password is
 * configured (`showEvalDefault`), the evaluation-only default credential is
 * surfaced so the surface is operable in non-production environments; a real
 * `OPS_BASIC_AUTH_PASSWORD` overrides it and suppresses the hint.
 */
export function renderAdminUnauthorizedPage(
  showEvalDefault: boolean,
  evalUser: string,
  evalPass: string,
): string {
  const hint = showEvalDefault
    ? `<p class="muted">This evaluation environment has no production password set, so the default admin credentials <code>${escapeHtml(
        evalUser,
      )}</code> / <code>${escapeHtml(
        evalPass,
      )}</code> are in effect. The same credentials authenticate the <code>/api/internal/*</code> endpoints (send them as an <code>Authorization: Basic</code> header).</p>`
    : `<p class="muted">Sign in with the ops admin credentials (HTTP Basic Auth). The same credentials authenticate the <code>/api/internal/*</code> endpoints.</p>`;
  return layout(
    "Admin · Sign in required",
    `<p class="eyebrow">Internal admin</p>
<h1>Admin access required</h1>
<p class="muted">This surface is gated. Anonymous requests are refused (HTTP 401).</p>
${hint}`,
  );
}
