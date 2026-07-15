# Apply form submit audit

**Mission:** `vygo-apply-persistence`  
**Live surface:** https://www.vygo.ai/apply  
**Machine-readable summary:** `GET /apply-audit.json`

## Phase 1 findings (pre-mission)

| Item                      | Finding                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page                      | `/apply` — “Apply for the next opening”                                                                                                                                                      |
| Fields                    | Full name (`fullName`), Work email (`email`), Product URL (`productUrl`), free-text message (`message`), plus the “Next available audit start date” banner (read-only from availability API) |
| Handler                   | **None.** The form was a server-rendered static HTML form with no `action`, no `method`, and no React `onSubmit`.                                                                            |
| Network request on submit | Browser default: **GET** to the same page with form fields in the **query string**. No `fetch`/XHR to an API.                                                                                |
| Server endpoint           | None for this form. (The separate waitlist intake at `POST /v1/waitlist` / `POST /api/waitlist` was not wired to this page.)                                                                 |
| Third-party               | None for submit (no form service, no email API call from this form).                                                                                                                         |
| Client storage            | No `localStorage` / `sessionStorage` writes.                                                                                                                                                 |
| Durable destination       | **Nowhere.** Query-string values were not persisted server-side. A placeholder note pointed users at `hello@vygo.ai`.                                                                        |

### Summary string (`previous_submit_handling`)

> Before this mission, the /apply form was a plain static HTML `<form>` with no action, no method, and no JavaScript onSubmit handler. Browser default submit issued a same-page GET navigation that put field values into the URL query string. No server handler, third-party service, localStorage, or database received the submission — data was not durably stored anywhere.

## Phase 2 — persistence (this mission)

| Item          | Implementation                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table         | `applications` in Railway project `vygo` Postgres                                                                                                                |
| Columns       | `id` (uuid, DB-generated), `full_name`, `work_email`, `product_url`, `message`, `source`, `created_at`                                                           |
| Submit        | `POST /api/apply` — validates `full_name` (required non-empty) and `work_email` (required, must look like `local@domain.tld`); inserts one row; returns JSON row |
| Read-back     | `GET /api/apply/:id` — returns the stored row as JSON                                                                                                            |
| Client        | `ApplyForm` posts JSON to `/api/apply` only; never embeds DB credentials                                                                                         |
| Invalid input | 4xx JSON error, no insert                                                                                                                                        |

### Summary string (`changed_to`)

> The form now POSTs JSON to `POST /api/apply`. The server validates input, inserts into the Railway Postgres `applications` table, and returns the created row. `GET /api/apply/<id>` proves durable read-back. The client never writes to the database.

### Live verification notes

- **Public hostname:** `https://www.vygo.ai` (Vercel production custom domain + TLS). Apex `https://vygo.ai` redirects to www; HTTP upgrades to HTTPS.
- Marketing origin: `POST https://www.vygo.ai/api/apply` (Vercel edge → Railway Postgres, direct or via API proxy).
- Read-back: `GET https://www.vygo.ai/api/apply/<uuid>`.
- Railway service origin (reachable default): `https://api-production-7f2d.up.railway.app/api/apply` (project `vygo`, service `api`).
- Invalid input returns HTTP 4xx JSON with no `id` and inserts nothing.
- Playwright: `apps/web/e2e/apply-form.spec.ts` covers success confirmation, 4xx error UI, and asserts the client never embeds DB credentials.
- Machine-readable audit: `GET https://www.vygo.ai/apply-audit.json` (no-store) with non-empty `previous_submit_handling` and `changed_to`.
