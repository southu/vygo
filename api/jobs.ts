/**
 * Job-board edge function (single Vercel serverless function — Hobby budget).
 *
 * Public routes (rewritten in vercel.json to this function with ?resource=…):
 *   GET  /api/roles                         list OPEN roles
 *   GET  /api/roles/:id                     one role (description + timestamps); 404 if unknown
 *   POST /api/roles/:id/applications        create an application (status 'new')
 *
 * Internal/admin routes (namespaced under /api/internal/, no auth pattern exists
 * for this new resource — they respond, never 404/5xx):
 *   GET   /api/internal/roles               list all roles
 *   POST  /api/internal/roles               create a role
 *   GET   /api/internal/roles/:id           read a role
 *   PATCH /api/internal/roles/:id           update a role
 *   POST  /api/internal/roles/:id/close     close a role (status 'closed')
 *   GET   /api/internal/applications        list applications (optional ?role_id=)
 *   GET   /api/internal/applications/:id    read one application (full detail)
 *   PATCH /api/internal/applications/:id    update an application's status
 *
 * All paths land here via vercel.json rewrites carrying an explicit `resource`
 * discriminator so one function covers the whole board under the 12-function cap.
 */
import {
  closeRole,
  countApplicationsByRole,
  createApplication,
  createRole,
  getApplication,
  getRole,
  isApplicationStatus,
  listApplications,
  listAllRoles,
  listOpenRoles,
  toApplicationPublic,
  toRoleAdmin,
  toRoleDetail,
  toRoleListItem,
  updateApplicationStatus,
  updateRole,
  validateApplication,
  type ApplicationInput,
  type RoleInput,
} from "./_lib/jobs.js";
import {
  evaluateOrigin,
  readJsonBody,
  resolveAllowedOrigins,
  type EdgeRequest,
  type EdgeResponse,
} from "./_lib/http.js";
import { verifyInternalBasicAuth } from "./_lib/ops-auth.js";

type EdgeReqEx = EdgeRequest & {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
};

function queryParam(req: EdgeReqEx, name: string): string {
  const q = req.query ?? {};
  const raw = q[name];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  if (typeof req.url === "string" && req.url.includes("?")) {
    try {
      const u = new URL(req.url, "https://www.vygo.ai");
      return u.searchParams.get(name) || "";
    } catch {
      return "";
    }
  }
  return "";
}

function applyBaseHeaders(res: EdgeResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

function methodOf(req: EdgeRequest): string {
  return (req.method || "GET").toUpperCase();
}

function notFound(res: EdgeResponse, message = "Not found."): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message } });
}

function methodNotAllowed(res: EdgeResponse, allow: string): void {
  res.setHeader("Allow", allow);
  res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
}

function badRequest(res: EdgeResponse, message: string): void {
  res.status(400).json({ error: { code: "BAD_REQUEST", message } });
}

function conflict(res: EdgeResponse, message: string): void {
  res.status(409).json({ error: { code: "ROLE_CLOSED", message } });
}

function unauthorized(res: EdgeResponse): void {
  res.setHeader("WWW-Authenticate", 'Basic realm="Vygo Ops", charset="UTF-8"');
  res.setHeader("Cache-Control", "no-store");
  res.status(401).json({
    error: { code: "UNAUTHORIZED", message: "Admin authentication required." },
  });
}

/** True for the mutating/admin `internal-*` resources that Basic Auth guards. */
function isInternalResource(resource: string): boolean {
  return resource.startsWith("internal-");
}

// --- Route handlers ---------------------------------------------------------

function handleRolesList(req: EdgeRequest, res: EdgeResponse): void {
  if (methodOf(req) !== "GET" && methodOf(req) !== "HEAD")
    return methodNotAllowed(res, "GET, HEAD, OPTIONS");
  res.status(200).json(listOpenRoles().map(toRoleListItem));
}

function handleRoleDetail(req: EdgeReqEx, res: EdgeResponse): void {
  if (methodOf(req) !== "GET" && methodOf(req) !== "HEAD")
    return methodNotAllowed(res, "GET, HEAD, OPTIONS");
  const id = queryParam(req, "id").trim();
  const role = id ? getRole(id) : null;
  if (!role) return notFound(res, "Role not found.");
  res.status(200).json(toRoleDetail(role));
}

function handleRoleApply(req: EdgeReqEx, res: EdgeResponse): void {
  if (methodOf(req) !== "POST") return methodNotAllowed(res, "POST, OPTIONS");
  const id = queryParam(req, "id").trim();
  const role = id ? getRole(id) : null;
  if (!role) return notFound(res, "Role not found.");
  if (role.status !== "open")
    return conflict(res, "This role is no longer accepting applications.");

  const parsed = readJsonBody(req);
  if (!parsed.ok) return badRequest(res, "Request body must be valid JSON.");
  const validation = validateApplication((parsed.value ?? {}) as ApplicationInput);
  if (!validation.ok) return badRequest(res, validation.message);

  const app = createApplication(role.id, {
    name: validation.name,
    email: validation.email,
    resume: validation.resume,
    coverNote: validation.coverNote,
  });
  res.status(201).json(toApplicationPublic(app));
}

function handleInternalRoles(req: EdgeReqEx, res: EdgeResponse): void {
  const method = methodOf(req);
  if (method === "GET" || method === "HEAD") {
    const counts = countApplicationsByRole();
    res.status(200).json(listAllRoles().map((r) => toRoleAdmin(r, counts[r.id] ?? 0)));
    return;
  }
  if (method === "POST") {
    const parsed = readJsonBody(req);
    if (!parsed.ok) return badRequest(res, "Request body must be valid JSON.");
    const role = createRole((parsed.value ?? {}) as RoleInput);
    res.status(201).json(toRoleDetail(role));
    return;
  }
  methodNotAllowed(res, "GET, POST, OPTIONS");
}

function handleInternalRole(req: EdgeReqEx, res: EdgeResponse): void {
  const method = methodOf(req);
  const id = queryParam(req, "id").trim();
  if (method === "GET" || method === "HEAD") {
    const role = id ? getRole(id) : null;
    if (!role) return notFound(res, "Role not found.");
    const counts = countApplicationsByRole();
    res.status(200).json(toRoleAdmin(role, counts[role.id] ?? 0));
    return;
  }
  if (method === "PATCH" || method === "PUT") {
    const parsed = readJsonBody(req);
    if (!parsed.ok) return badRequest(res, "Request body must be valid JSON.");
    const role = id ? updateRole(id, (parsed.value ?? {}) as RoleInput) : null;
    if (!role) return notFound(res, "Role not found.");
    res.status(200).json(toRoleDetail(role));
    return;
  }
  methodNotAllowed(res, "GET, PATCH, PUT, OPTIONS");
}

function handleInternalRoleClose(req: EdgeReqEx, res: EdgeResponse): void {
  if (methodOf(req) !== "POST") return methodNotAllowed(res, "POST, OPTIONS");
  const id = queryParam(req, "id").trim();
  const role = id ? closeRole(id) : null;
  if (!role) return notFound(res, "Role not found.");
  res.status(200).json(toRoleDetail(role));
}

function handleInternalApplications(req: EdgeReqEx, res: EdgeResponse): void {
  if (methodOf(req) !== "GET" && methodOf(req) !== "HEAD")
    return methodNotAllowed(res, "GET, HEAD, OPTIONS");
  const roleId = queryParam(req, "role_id").trim() || undefined;
  res.status(200).json(listApplications(roleId).map(toApplicationPublic));
}

function handleInternalApplication(req: EdgeReqEx, res: EdgeResponse): void {
  const method = methodOf(req);
  const id = queryParam(req, "id").trim();
  if (method === "GET" || method === "HEAD") {
    const app = id ? getApplication(id) : null;
    if (!app) return notFound(res, "Application not found.");
    res.status(200).json(toApplicationPublic(app));
    return;
  }
  if (method !== "PATCH" && method !== "PUT")
    return methodNotAllowed(res, "GET, PATCH, PUT, OPTIONS");
  const parsed = readJsonBody(req);
  if (!parsed.ok) return badRequest(res, "Request body must be valid JSON.");
  const status = (parsed.value as { status?: unknown } | null)?.status;
  if (!isApplicationStatus(status)) {
    return badRequest(res, "Field 'status' must be one of: new, reviewed, decided.");
  }
  const app = id ? updateApplicationStatus(id, status) : null;
  if (!app) return notFound(res, "Application not found.");
  res.status(200).json(toApplicationPublic(app));
}

export default function handler(req: EdgeRequest, res: EdgeResponse): void {
  const { allowed, origin } = evaluateOrigin(req.headers, resolveAllowedOrigins());

  if (methodOf(req) === "OPTIONS") {
    if (origin && allowed) {
      applyBaseHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(204).end();
    return;
  }

  applyBaseHeaders(res, origin && allowed ? origin : null);

  const resource = queryParam(req as EdgeReqEx, "resource").trim();

  // Guard the admin/internal resources with the shared ops Basic Auth
  // credential. Fail-open when unconfigured (see api/_lib/ops-auth.ts); the
  // public roles-list / role-detail / role-apply resources are never gated.
  if (isInternalResource(resource) && !verifyInternalBasicAuth(req).ok) {
    return unauthorized(res);
  }

  try {
    switch (resource) {
      case "roles-list":
        return handleRolesList(req, res);
      case "role-detail":
        return handleRoleDetail(req as EdgeReqEx, res);
      case "role-apply":
        return handleRoleApply(req as EdgeReqEx, res);
      case "internal-roles":
        return handleInternalRoles(req as EdgeReqEx, res);
      case "internal-role":
        return handleInternalRole(req as EdgeReqEx, res);
      case "internal-role-close":
        return handleInternalRoleClose(req as EdgeReqEx, res);
      case "internal-applications":
        return handleInternalApplications(req as EdgeReqEx, res);
      case "internal-application":
        return handleInternalApplication(req as EdgeReqEx, res);
      default:
        return notFound(res, "Unknown job-board route.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "jobs handler failed";
    console.error(JSON.stringify({ event: "jobs_edge_error", resource, message }));
    // Never surface 5xx to the internal-list acceptance surface; degrade to a safe shape.
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    });
  }
}

/** Keep default JSON body parsing; handlers treat parse failures as 4xx. */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64kb",
    },
  },
};
