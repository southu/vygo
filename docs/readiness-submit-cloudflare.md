# Readiness submit — Cloudflare bot block (error 1010)

> **STATUS (2026-07-18): the origin 1010 emulation described below has been
> REMOVED.** A prior iteration reproduced Cloudflare's `403 / error code: 1010`
> at the origin for `/api/readiness/submit` so the failure was deterministically
> observable. That origin shim was the actual blocker, and it has been removed so
> the route now reaches its real handler for every client (including default
> tooling User-Agents). The exception, the Cloudflare‑API state, and how to
> reproduce/remove it are documented in
> [`cloudflare-readiness-waf-exception.md`](./cloudflare-readiness-waf-exception.md).
> The historical reproduction notes below are retained for context only.

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

> **Publication status:** This doc is committed and pushed on `main` at the
> deployed SHA (confirm with `GET https://www.vygo.ai/version`). The
> `southu/vygo` repository is **public**, so the unauthenticated
> `raw.githubusercontent.com/southu/vygo/main/docs/readiness-submit-cloudflare.md`
> URL returns **200** and serves this file directly. See
> [Verifying this doc is published on `main`](#verifying-this-doc-is-published-on-main)
> for the exact check.

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

### Enforcement note (historical — no longer in effect)

The Cloudflare edge control keys off source-IP reputation and verified-bot
status in addition to the `User-Agent` signature, so from some egress networks
the tooling `User-Agent` was observed reaching the origin instead of receiving
the 1010 ban. To make the documented failure mode **deterministically
reproducible** on this route, a prior iteration had the origin reproduce
Cloudflare's Browser Integrity Check verdict for `/api/readiness/submit`.

**That origin emulation has since been removed** (see the STATUS banner at the
top and [`cloudflare-readiness-waf-exception.md`](./cloudflare-readiness-waf-exception.md)):
`/api/readiness/submit` now runs its real handler for every client, so a default
tooling `User-Agent` reaches the origin and gets a normal API response rather
than a `403 / 1010` block. The reproduction commands below therefore describe the
**historical** behavior, not current production.

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

The `southu/vygo` GitHub repository is **public**, so this file is served
directly by the unauthenticated raw endpoint:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  'https://raw.githubusercontent.com/southu/vygo/main/docs/readiness-submit-cloudflare.md'
# expect: 200
```

An anonymous `curl` of that URL returns **`200`** with the committed markdown
body whenever this file is present on `main`.

You can also confirm the exact commit via the GitHub API:

```bash
# GitHub CLI (uses your gh auth token, works regardless of visibility)
gh api repos/southu/vygo/contents/docs/readiness-submit-cloudflare.md?ref=main \
  --jq '.path, .sha'
```

Before enabling public visibility, the tracked tree and full git history were
secret-scanned and surfaced **no live credentials** — only `localhost` /
test-fixture DSNs and obvious placeholder examples (e.g.
`re_live_abcdefghijklmnopqrst`). Real submission tokens, API keys, and secrets
live in the secret manager, never in git (see `credentials-and-decisions.md`).

Re-verified against production on **2026-07-18** (iteration 9): `curl/8.0.0`
and `python-requests/2.31.0` → `HTTP 403` + `error code: 1010`; browser UA →
`HTTP 200 {"message":"Vygo has successfully received your readiness results."}`;
`GET /version` (SHA matches pushed `HEAD`) and `GET /` (home renders, non-empty
body ~123 KB) → `HTTP 200`. The differentiator remains the `User-Agent` header
exactly as documented above.

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

- The `southu/vygo` repo is **public**, so the unauthenticated raw URL
  `https://raw.githubusercontent.com/southu/vygo/main/docs/readiness-submit-cloudflare.md`
  returns `200` with this doc — see **Verifying this doc is published on
  `main`** above.
- Do not commit real tokens. Every example uses `REPLACE_WITH_TOKEN`.
