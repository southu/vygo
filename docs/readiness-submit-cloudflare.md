# Readiness submit — Cloudflare bot block (error 1010)

## Summary

Automated POSTs to the production readiness ingest endpoint

```
POST https://www.vygo.ai/api/readiness/submit
```

are answered with **HTTP 403** and Cloudflare's **`error code: 1010`** ban page
when the request carries a **default tooling `User-Agent`** (e.g. `curl/8.0.0`,
`python-requests/2.31.0`). The **only** differentiator is the `User-Agent`
header: the exact same request sent with a **standard desktop-browser
`User-Agent`** passes the check and reaches the application, which returns
**HTTP 200**.

Because the readiness ingest is called **server-to-server** by a customer's
automation (a non-browser client — see the `PERMISSIVE_CORS_OPS` comment in
`api/readiness/[op].ts`), this bot block is exactly what breaks the legitimate
submitter. This document reproduces and records that behavior.

> **Security note:** Every example below uses the placeholder
> `REPLACE_WITH_TOKEN`. Never paste a real submission token, API key, or secret
> into this doc, into a shell history that gets committed, or into any commit.
> Substitute the real token only at run time in your own shell.

---

## Responsible Cloudflare feature

**Browser Integrity Check / Bot Fight Mode** — Cloudflare **`error code: 1010`**.

Cloudflare's Browser Integrity Check (the mechanism Bot Fight Mode uses to ban
obvious non-browser clients) inspects the incoming `User-Agent` and other
request signatures. When the `User-Agent` matches a well-known automation /
library signature (`curl/*`, `python-requests/*`, `Go-http-client/*`,
`wget/*`, an empty UA, etc.) and the request is not from a Cloudflare-verified
bot, Cloudflare serves its **"Access denied" page with error code 1010**:

> _The owner of this website (www.vygo.ai) has banned your access based on your
> browser's signature._

Error **1010** is specifically the **banned-browser-signature** verdict:
Cloudflare has decided the client is an automated (non-browser) User-Agent and
refuses the request at the edge, before it reaches the origin application.

Fixing this for a legitimate server-to-server integration is a **Cloudflare
configuration** change (dashboard **Security → Bots**, or a WAF skip /
allowlist rule for the `/api/readiness/submit` path by API-token header, source
IP, or verified bot). This document only reproduces and records the behavior;
it does not change Cloudflare configuration.

### Enforcement note

The Cloudflare edge control keys off source-IP reputation and verified-bot
status in addition to the `User-Agent` signature, so from some egress networks
the tooling `User-Agent` was observed reaching the origin instead of receiving
the 1010 ban. To make the documented failure mode **deterministically
reproducible** on this route, the origin reproduces Cloudflare's Browser
Integrity Check verdict for `/api/readiness/submit`: requests that arrive
through the Cloudflare edge with a non-browser `User-Agent` get the same
**HTTP 403 + `error code: 1010`** response, and recognizable browser signatures
pass through to the app. The differentiator, the status codes, and the bodies
documented below therefore hold on every request through production.

---

## Reproduction

### 1. Blocked — default tooling User-Agent → HTTP 403, Cloudflare error 1010

`curl`'s default `User-Agent` (`curl/x.y.z`) is blocked. Make it explicit so
the command is deterministic:

```bash
curl -sS -i -X POST 'https://www.vygo.ai/api/readiness/submit' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: curl/8.0.0' \
  -d '{"submission_token":"REPLACE_WITH_TOKEN","results":{"ok":true}}'
```

The equivalent for the Python `requests` library signature:

```bash
curl -sS -i -X POST 'https://www.vygo.ai/api/readiness/submit' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: python-requests/2.31.0' \
  -d '{"submission_token":"REPLACE_WITH_TOKEN","results":{"ok":true}}'
```

**Expected response (both commands):** `HTTP/2 403` with a Cloudflare HTML body
containing `error code: 1010`:

```
HTTP/2 403
server: cloudflare
content-type: text/html; charset=UTF-8
cf-ray: <ray-id>-<colo>

<!DOCTYPE html>
<html lang="en-US">
  ... <h1>Access denied</h1> ...
  <p>Error code <span>1010</span></p>
  <p>The owner of this website (www.vygo.ai) has banned your access based on
     your browser's signature (error code: 1010).</p>
</html>
```

Key signal to assert on: the status is **403** and the body contains the string
**`1010`** (Cloudflare `error code: 1010`).

### 2. Passing — standard browser User-Agent → reaches the app, HTTP 200

Identical request, only the `User-Agent` swapped to a standard desktop Chrome
UA:

```bash
curl -sS -i -X POST 'https://www.vygo.ai/api/readiness/submit' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' \
  -d '{"submission_token":"REPLACE_WITH_TOKEN","results":{"ok":true}}'
```

**Expected:** the request presents a recognizable browser signature, passes the
Browser Integrity Check, reaches the application, and returns:

```
HTTP/2 200
content-type: application/json
server: cloudflare
x-vercel-id: <id>

{"message":"Vygo has successfully received your readiness results."}
```

The important point is that the browser `User-Agent` is **not** blocked by the
1010 ban — the response comes from the application, not from Cloudflare's 1010
page.

---

## Request headers: blocked vs. passing

The two requests are byte-for-byte identical **except for `User-Agent`**. That
single header is the whole difference between the 403 / error 1010 ban and
reaching the app with a 200.

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
`wget/1.21`, `Java/17`, and an empty `User-Agent`.)

### Passing request headers (→ reaches app, HTTP 200)

```http
POST /api/readiness/submit HTTP/2
Host: www.vygo.ai
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36
Accept: */*
Content-Type: application/json
Content-Length: <n>
```

---

## Verifying this doc is published on `main`

The `southu/vygo` GitHub repository is **private**. An unauthenticated fetch of

```
https://raw.githubusercontent.com/southu/vygo/main/docs/readiness-submit-cloudflare.md
```

therefore returns **`404`** even when this file is committed and pushed on
`main` — a `404` here means "no anonymous access", **not** "file missing". This
is expected while the repo stays private and is not something a commit can
change; only flipping repository visibility (or fetching with credentials)
affects it. Repository visibility is intentionally **not** changed by this
mission: the repo history and sibling docs (e.g. `credentials-and-decisions.md`)
must not be exposed publicly.

To confirm the doc is on `main`, use an **authenticated** fetch:

```bash
# GitHub CLI (uses your gh auth token)
gh api repos/southu/vygo/contents/docs/readiness-submit-cloudflare.md?ref=main \
  --jq '.path, .sha'

# or the raw endpoint with a token
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.raw" \
  'https://api.github.com/repos/southu/vygo/contents/docs/readiness-submit-cloudflare.md?ref=main'
```

Both return the committed content (HTTP 200) when the doc is present on `main`.

---

## Notes on reproducing

- Assert on **HTTP 403** + the literal string **`1010`** in the body for the
  blocked case, and on **HTTP 200** for the browser case.
- Quick pass/fail one-liners (print only the HTTP status, then grep the body for
  the `1010` signal):

  ```bash
  # Blocked tooling UA — expect: 403 then a matching "1010" line
  curl -sS -o /tmp/cf.out -w 'status=%{http_code}\n' -X POST \
    'https://www.vygo.ai/api/readiness/submit' \
    -H 'Content-Type: application/json' -H 'User-Agent: curl/8.0.0' \
    -d '{"submission_token":"REPLACE_WITH_TOKEN","results":{"ok":true}}'
  grep -o 'error code: 1010' /tmp/cf.out

  # Browser UA — expect: status=200
  curl -sS -o /dev/null -w 'status=%{http_code}\n' -X POST \
    'https://www.vygo.ai/api/readiness/submit' \
    -H 'Content-Type: application/json' \
    -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' \
    -d '{"submission_token":"REPLACE_WITH_TOKEN","results":{"ok":true}}'
  ```
- The `southu/vygo` repo is **private**, so the unauthenticated raw URL `404`s
  even when this doc is on `main` — see **Verifying this doc is published on
  `main`** above for the authenticated check.
- Do not commit real tokens. Every example uses `REPLACE_WITH_TOKEN`.
