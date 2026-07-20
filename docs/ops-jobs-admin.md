# Ops job-role admin (internal)

Manage job roles end to end: create, edit, close, and reopen. Closing a role
takes effect immediately on the live public site — the role disappears from the
public roles list and new applications for it are rejected. Reopening restores
it.

**Live path:** https://www.vygo.ai/ops/jobs

## Data API (same-origin only)

The admin surface reads and writes exclusively through the job-board internal
endpoints — the same data layer that serves the public careers list. No parallel
data path is introduced.

| Method | Path                            | Purpose                                            |
| ------ | ------------------------------- | -------------------------------------------------- |
| GET    | `/api/internal/roles`           | List every role (open + closed)                    |
| POST   | `/api/internal/roles`           | Create a role (title, location, type, description) |
| GET    | `/api/internal/roles/:id`       | Read one role                                      |
| PATCH  | `/api/internal/roles/:id`       | Edit fields; reopen a role (`status: "open"`)      |
| POST   | `/api/internal/roles/:id/close` | Close a role (`status → closed`)                   |

The public read/apply endpoints are unchanged and always open:

| Method | Path                          | Purpose                                           |
| ------ | ----------------------------- | ------------------------------------------------- |
| GET    | `/api/roles`                  | Public list — **open roles only**                 |
| GET    | `/api/roles/:id`              | Public role detail                                |
| POST   | `/api/roles/:id/applications` | Apply — rejected with 409 when the role is closed |

## Auth (existing ops Basic Auth pattern)

HTTP **Basic Auth**, reusing the same credential that guards `/ops/readiness`.
Credentials are read only from the process environment of the marketing edge
deployment — never hard-coded, never a request field, never `NEXT_PUBLIC_*`.

| Variable                  | Purpose                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `OPS_BASIC_AUTH_USER`     | Username (default `ops` when a password is set)                                                  |
| `OPS_BASIC_AUTH_PASSWORD` | Password. When set, every `/api/internal/roles*` call requires it and returns **401** otherwise. |

**How an operator authenticates:** open `/ops/jobs`, enter the `OPS_BASIC_AUTH_*`
username and password. The browser stores them in `sessionStorage` for the tab
only and sends them as an `Authorization: Basic` header on every management
request. To protect the surface in production, set `OPS_BASIC_AUTH_PASSWORD` in
the marketing edge (Vercel) environment.

**Unconfigured behavior:** the job-board internal routes were introduced without
an auth pattern (they must respond, never 401/5xx). Until `OPS_BASIC_AUTH_PASSWORD`
is set they remain reachable, preserving that contract; setting the password
turns on enforcement for both the API and the admin UI with no code change.

The admin page itself renders **no management controls** until credentials are
entered — an anonymous visitor sees only the sign-in form.

## Fields

| Field         | Notes                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `title`       | Role title shown publicly                                                                                      |
| `location`    | e.g. `Remote (US)`                                                                                             |
| `type`        | e.g. `full-time`, `contract`                                                                                   |
| `description` | Full role description; the public list teaser (`summary`) is derived from its first sentence when not provided |

## Browser API origin

All requests target **https://www.vygo.ai** (relative `/api/internal/...`). Do
not call `api.vygo.ai` from client code.
