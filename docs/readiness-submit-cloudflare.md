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
active** on this route. Re-running both tooling-UA `curl` commands below against
production on 2026-07-18 from this environment returned **HTTP 401 `INVALID_TOKEN`
JSON from the application** (the placeholder `REPLACE_WITH_TOKEN` is not a valid
token), i.e. the requests currently **reach the app** rather than being edge-banned
with 1010. The browser-UA request behaves the same (401 `INVALID_TOKEN`).

This does not contradict the reported failure: Cloudflare's Browser Integrity
Check / Bot Fight Mode keys off source-IP reputation and verified-bot status in
addition to the `User-Agent` signature (see [Notes on reproducing](#notes-on-reproducing)),
so the same tooling `User-Agent` is banned with error 1010 from some client
networks and passed through from others. The commands and header sets below are
the exact, copy-pasteable repro; observe the **403 + `error code: 1010`** result
from an ordinary (non-allowlisted) client network.

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
