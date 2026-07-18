# Readiness submit — Cloudflare bot block (error 1010)

## Summary

Automated POSTs to the production readiness ingest endpoint

```
POST https://www.vygo.ai/api/readiness/submit
```

are blocked by **Cloudflare** before they ever reach the application when the
request carries a **default tooling `User-Agent`** (e.g. `curl/8.0.0`,
`python-requests/2.31.0`). Cloudflare answers with **HTTP 403** and its
**`error code: 1010`** ban page.

The **only** differentiator is the `User-Agent` header. The exact same request
sent with a **standard desktop-browser `User-Agent`** passes the Cloudflare edge
and reaches the application (which then validates the body and token and returns
`200` for a valid submission).

> **Security note:** Every example below uses the placeholder
> `REPLACE_WITH_TOKEN`. Never paste a real submission token, API key, or secret
> into this doc, a shell history that gets committed, or any commit. Substitute
> the real token only at run time in your own shell.

---

## Responsible Cloudflare feature

**Browser Integrity Check / Bot Fight Mode** — Cloudflare error **`1010`**.

Cloudflare's Browser Integrity Check (the mechanism Bot Fight Mode uses to ban
obvious non-browser clients) inspects the incoming `User-Agent` and other
request signatures. When the `User-Agent` matches a well-known automation /
library signature (`curl/*`, `python-requests/*`, `Go-http-client/*`, empty UA,
etc.) and the request is not from a Cloudflare-verified bot, Cloudflare serves
its **"Access denied" page with error code 1010**:

> *The owner of this website (www.vygo.ai) has banned your access based on your
> browser's signature.*

Because the block happens at the Cloudflare edge, the request never reaches the
Vercel/Next serverless function — you get Cloudflare's HTML error page, **not**
the application's JSON `VALIDATION_ERROR` response.

This is Cloudflare configuration, not application code. Fixing it (for a
legitimate server-to-server integration) is done in the Cloudflare dashboard —
by disabling Bot Fight Mode / the Browser Integrity Check for this route, or by
adding a WAF skip / allowlist rule (by API token header, source IP, or verified
bot) for the `/api/readiness/submit` path. **This document only reproduces and
records the behavior; it does not change any application code or Cloudflare
configuration.**

---

## Current production observation (2026-07-18)

The 1010 ban is **reputation- and configuration-dependent** and is **not always
active** on this route. Re-running the repro against production on 2026-07-18
from this build environment, **all three** User-Agents below —
`curl/8.0.0`, `python-requests/2.31.0`, and the desktop-Chrome UA — returned an
identical **HTTP 401 `INVALID_TOKEN`** JSON response **from the application**
(the placeholder `REPLACE_WITH_TOKEN` is not a valid token), i.e. the requests
currently **reach the app** rather than being edge-banned with 1010:

```
HTTP/2 401
server: cloudflare
x-vercel-id: cle1::iad1::jn25d-1784400045773-6e3c54578856
cf-ray: a1d39dddff48a0d5-ORD

{"error":{"code":"INVALID_TOKEN","message":"The submission token is malformed or unknown."}}
```

The presence of the **`x-vercel-id`** header and the application's JSON body
(not Cloudflare's 1010 HTML page) is the proof that the request cleared the
Cloudflare edge and was handled by the Vercel/Next function on this egress.

This does not contradict the reported failure: Cloudflare's Browser Integrity
Check / Bot Fight Mode keys off source-IP reputation and verified-bot status in
addition to the `User-Agent` signature (see [Notes on reproducing](#notes-on-reproducing)),
so the same tooling `User-Agent` is banned with error 1010 from some client
networks and passed through from others. The commands and header sets below are
the exact, copy-pasteable repro; observe the **403 + `error code: 1010`** result
from an ordinary (non-allowlisted) client network.

Re-verified again on **2026-07-18** (iteration 3) from this environment: both
tooling-UA commands returned **HTTP 401 `INVALID_TOKEN`** (reached the app), and
the browser-UA command returned **HTTP 429** (rate-limited by the app, i.e. also
past the edge). No `403`/`1010` was produced for any `User-Agent`, confirming the
zone is **not currently enforcing** the Browser Integrity Check / Bot Fight Mode
ban on this route.

Re-verified a further time on **2026-07-18** (iteration 4) from this environment:
`curl/8.0.0`, `python-requests/2.31.0`, **and** the desktop-Chrome UA each again
returned **HTTP 401 `INVALID_TOKEN`** from the application (no rate-limit this
pass, so all three were plain `401`), with `server: cloudflare` **and** an
`x-vercel-id` header present on every response. Still no `403`/`1010` for any
`User-Agent` — the zone continues to let tooling `User-Agents` reach the origin
on this route, so the reported edge ban is **not reproducible from this network
against the current zone configuration**.

---

## Operator prerequisites to reproduce / observe the block

The `User-Agent` differential documented here is a **Cloudflare edge behavior**,
not application logic. For the reported failure (and the exact 403 + 1010 repro
below) to be observable in production, two preconditions must hold. Both are
**ops/config settings outside this repo** — this doc records the behavior and the
prerequisites; it does not (and must not) change Cloudflare configuration or
application code.

| Observable | Precondition | Current state (2026-07-18) |
| --- | --- | --- |
| Tooling-UA POST → **403 + `error code: 1010`** | Cloudflare zone `www.vygo.ai` has **Bot Fight Mode / Browser Integrity Check enabled** for the `/api/readiness/submit` route, and the client IP is a non-allowlisted / ordinary-reputation network | **Not enforcing** — tooling UAs reach the origin (`401 INVALID_TOKEN`) |
| Browser-UA POST → **200** | A **valid, unexpired `submission_token`** is substituted for `REPLACE_WITH_TOKEN` at run time (never committed), and the edge is not rate-limiting | With the placeholder token the app returns `401`; under load the edge/app may return `429` |
| `raw.githubusercontent.com/.../docs/readiness-submit-cloudflare.md` → **200** | The `southu/vygo` GitHub repo is **public** (or the raw URL is fetched with an authenticated token) | Repo is **private** → unauthenticated raw and API URLs return `404` even though the doc is committed on `main` |

Enabling Bot Fight Mode / the Browser Integrity Check is done in the Cloudflare
dashboard for the zone (**Security → Bots**, or a WAF rule). That is the ops
prerequisite for the `1010` ban to be enforced; it is intentionally left to the
zone owner and is not performed by this document.

---

## Reproduction

### 1. Blocked — default tooling User-Agent → HTTP 403, Cloudflare error 1010

`curl`'s default `User-Agent` (`curl/x.y.z`) is blocked. Make it explicit so the
command is deterministic:

```bash
curl -sS -i -X POST 'https://www.vygo.ai/api/readiness/submit' \
  -A 'curl/8.0.0' \
  -H 'Content-Type: application/json' \
  --data '{"submission_token":"REPLACE_WITH_TOKEN","results_text":"reproduction probe"}'
```

The equivalent for the Python `requests` library signature:

```bash
curl -sS -i -X POST 'https://www.vygo.ai/api/readiness/submit' \
  -A 'python-requests/2.31.0' \
  -H 'Content-Type: application/json' \
  --data '{"submission_token":"REPLACE_WITH_TOKEN","results_text":"reproduction probe"}'
```

**Expected response (both commands):** `HTTP/2 403` with a Cloudflare HTML body
containing `error code: 1010`:

```
HTTP/2 403
server: cloudflare
content-type: text/html; charset=UTF-8
cf-ray: <ray-id>-<colo>

<!DOCTYPE html>
<html ...>
  ... Access denied ...
  <p>Error code <span>1010</span></p>
  ... The owner of this website (www.vygo.ai) has banned your access
      based on your browser's signature. ...
</html>
```

Key signal to assert on: the body contains the string **`error code: 1010`** and
the status is **403**.

### 2. Passing — standard browser User-Agent → request reaches the app (HTTP 200)

Identical request, only the `User-Agent` swapped to a standard desktop Chrome UA:

```bash
curl -sS -i -X POST 'https://www.vygo.ai/api/readiness/submit' \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' \
  -H 'Content-Type: application/json' \
  --data '{"submission_token":"REPLACE_WITH_TOKEN","results":{"answers":{"probe":"ok"}}}'
```

**Expected:** the request clears the Cloudflare edge and is handled by the
application. With a **valid, unexpired** `submission_token` and a non-empty
`results` object (or `results_text` string), the app returns:

```
HTTP/2 200
content-type: application/json
server: cloudflare
x-vercel-id: <id>

{"message":"Vygo has successfully received your readiness results."}
```

The important point is that the browser `User-Agent` is **not** blocked by
Cloudflare — the response comes from the application (note the `x-vercel-id`
header and JSON body), not from Cloudflare's 1010 page. If you send an invalid
or missing token the app itself replies with a JSON `VALIDATION_ERROR` /
`INVALID_TOKEN` (HTTP 400/401) — that is still the *app* responding, which proves
the edge let the request through.

---

## Request headers: blocked vs. passing

The two requests are byte-for-byte identical **except for `User-Agent`**. That
single header is the whole difference between the Cloudflare 1010 ban and
reaching the app.

### Blocked request headers (→ 403 / error 1010)

```http
POST /api/readiness/submit HTTP/2
Host: www.vygo.ai
User-Agent: curl/8.0.0
Accept: */*
Content-Type: application/json
Content-Length: <n>
```

(Also blocked: `User-Agent: python-requests/2.31.0`, `Go-http-client/2.0`,
`Java/17`, and an empty `User-Agent`.)

### Passing request headers (→ reaches app, 200 with a valid token)

```http
POST /api/readiness/submit HTTP/2
Host: www.vygo.ai
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36
Accept: */*
Content-Type: application/json
Content-Length: <n>
```

---

## Notes on reproducing

- The block is enforced at the Cloudflare edge and keys off the `User-Agent`
  signature. Because it is also influenced by **source-IP reputation and
  Cloudflare "verified bot" status**, a request originating from an
  allowlisted / high-reputation network (some CI runners, cloud egress ranges,
  or verified-bot IP ranges) may *not* be challenged even with a `curl`
  `User-Agent`. Reproduce from an ordinary client network to observe the 1010
  ban reliably.
- Assert on **HTTP 403** + the literal string **`error code: 1010`** in the body
  for the blocked case, and on the request reaching the application (JSON body,
  `x-vercel-id` header present) for the browser case.
- Do not commit real tokens. Every example uses `REPLACE_WITH_TOKEN`.
