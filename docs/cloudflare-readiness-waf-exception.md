# Cloudflare readiness WAF exception — `/api/readiness/submit`

**Goal:** POSTs (and the OPTIONS preflight) to
`https://www.vygo.ai/api/readiness/submit` must reach the origin application
instead of being answered with a Cloudflare bot/browser-signature block
(**HTTP 403 + `error code: 1010`**), while every other path keeps its existing
bot protection.

This runbook records what was actually blocking the route, the change that was
made, the Cloudflare‑API state (what could and could not be done with the
provisioned token), and how to reproduce, remove, or complete the edge‑side
exception.

> **Security note:** No Cloudflare API token or other secret is recorded in this
> file or anywhere in the repo. Credentials are read from environment variables
> at run time only (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Zone and
> account **identifiers** below are not secrets (they appear in dashboard URLs);
> the API **token** never is and is never printed, logged, or committed.

---

## Root cause (important — the block was at the origin, not a real CF rule)

The deterministic `403 + error code: 1010` on `/api/readiness/submit` was **not**
produced by a Cloudflare WAF/Bot‑Fight rule. It was produced by an **origin
application shim** that a previous iteration added to `api/readiness/[op].ts`.

That shim:

- fired only for `op === "submit"`, and only when the request carried
  Cloudflare edge headers (`cf-ray` / `cf-connecting-ip`), i.e. real production
  traffic through the CF edge;
- inspected the `User-Agent`, and for non‑browser signatures (`curl/*`,
  `python-requests/*`, empty UA, …) returned a **hand‑built copy of Cloudflare's
  "Access denied" / error‑1010 HTML page with HTTP 403** — `Server: cloudflare`,
  `Cf-Mitigated: challenge`, etc.;
- for browser‑looking UAs returned a hard‑coded `200` success message **without
  running the real submit handler at all**.

Because that shim runs at the origin — _after_ Cloudflare — **no Cloudflare rule
could ever unblock the route while the shim existed.** The shim was the actual
blocker, and it lived in this repository.

The original report that framed this as a Cloudflare control lives in
[`readiness-submit-cloudflare.md`](./readiness-submit-cloudflare.md); the
"reproduced at the origin" emulation described there has now been removed.

---

## The fix that was applied (this repo, deploys via the normal pipeline)

Removed the origin 1010 emulation, scoped to **exactly** the submit route, so
`/api/readiness/submit` now runs its real handler (`handleSubmit`) for every
client:

- Deleted the `op === "submit"` interception block in the request handler in
  `api/readiness/[op].ts` (the branch that called `sendCloudflareBrowserBan`).
- Deleted the now‑unused shim helpers: `firstHeaderValue`,
  `isCloudflareEdgeRequest`, `isBrowserUserAgent`, `TOOLING_UA_RE`, and
  `sendCloudflareBrowserBan`.
- Removed the matching unit tests
  (`readiness submit — Cloudflare 1010 edge emulation`) in
  `api/_lib/readiness.test.ts`.

Scope and safety:

- **Path‑scoped:** only the `submit` op is affected. No other readiness op, no
  other route, and no global behavior changed.
- **POST + OPTIONS:** POST now reaches `handleSubmit`; the OPTIONS preflight for
  `submit` was already answered `204` with permissive CORS (see
  `PERMISSIVE_CORS_OPS`) and is unchanged.
- **No protection downgraded:** the shim was a _fake_ Cloudflare block, not a
  real one. Removing it does not disable Bot Fight Mode, Browser Integrity
  Check, or any real WAF ruleset. Sibling paths (e.g.
  `/api/readiness/other-check`) are untouched — an unknown op still returns the
  application `404`, and any real edge bot protection on other paths is
  unaffected.

### Resulting behavior on `/api/readiness/submit`

`handleSubmit` validates the request and returns an **API‑shaped** response:

| Request (default curl UA)                          | Response                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `POST` empty / minimal JSON, no `submission_token` | `400 {"error":{"code":"VALIDATION_ERROR",...}}`                      |
| `POST` non‑JSON `Content-Type`                     | `415 {"error":{"code":"UNSUPPORTED_MEDIA_TYPE",...}}`                |
| `POST` valid `submission_token` + `results`        | `200 {"message":"Vygo has successfully received..."}` (or app error) |
| `OPTIONS`                                          | `204` with CORS headers                                              |

None of these is a Cloudflare `403 / 1010` block page.

---

## Cloudflare API state — what the provisioned token can and cannot do

The mission's preferred edge‑side deliverable is a narrow Cloudflare WAF
exception applied via the API. The token provisioned into this environment
(`CLOUDFLARE_API_TOKEN`) is **read‑only at the zone level** and cannot manage
WAF / rulesets / settings. Probed at run time (token value never printed):

| Cloudflare endpoint                                                         | Result   |
| --------------------------------------------------------------------------- | -------- |
| `GET /zones?name=vygo.ai`                                                   | `200` ✅ |
| `GET /zones/{zone}`                                                         | `200` ✅ |
| `GET /zones/{zone}/settings`                                                | `403` ❌ |
| `GET /zones/{zone}/rulesets`                                                | `403` ❌ |
| `GET /zones/{zone}/rulesets/phases/http_request_firewall_custom/entrypoint` | `403` ❌ |
| `GET /accounts/{account}/rulesets`                                          | `403` ❌ |
| `GET /zones/{zone}/filters` and `/firewall/rules`                           | `403` ❌ |
| `GET /zones/{zone}/bot_management`                                          | `403` ❌ |

- **Zone:** `vygo.ai` — zone id `2ccdfc4806d39d840e3601aa1d699aa0` (status
  `active`). Host in scope: `www.vygo.ai`.
- **Conclusion:** creating/reading a WAF custom rule is **access denied** with
  this token. Per the mission's fail‑closed rule, **no broader change was made
  and no protection was disabled** to work around it. The route was unblocked by
  removing the in‑repo origin shim (the real cause), which is narrower than any
  edge change, not broader.

### To complete the edge‑side exception (needs a WAF‑scoped token)

If/when a token with **Zone → WAF (edit)** / **Account Rulesets (edit)** scope is
provisioned, add a single **skip** rule to the zone's custom‑firewall phase,
scoped to exactly this path and its methods. Intended rule:

- **Zone:** `2ccdfc4806d39d840e3601aa1d699aa0` (`vygo.ai`)
- **Phase / ruleset:** `http_request_firewall_custom` entry point
- **Expression:**

  ```
  (http.request.uri.path eq "/api/readiness/submit" and (http.request.method eq "POST" or http.request.method eq "OPTIONS"))
  ```

- **Action:** `skip`
- **Skips (bot / browser‑signature checks only):** Browser Integrity Check
  (`bic`) and User‑Agent Blocking (`uaBlock`); plus the Super Bot Fight Mode
  phase (`http_request_sbfm`) if enabled on the zone.
- **Description:** `readiness submit ingest — skip bot/browser-signature checks (error 1010) for server-to-server automation; path-scoped`

Apply (token from env, never printed):

```bash
ZONE=2ccdfc4806d39d840e3601aa1d699aa0
RULESET=$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE}/rulesets/phases/http_request_firewall_custom/entrypoint" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["id"])')

curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/zones/${ZONE}/rulesets/${RULESET}/rules" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "action": "skip",
    "action_parameters": {
      "products": ["bic", "uaBlock"],
      "phases": ["http_request_sbfm"]
    },
    "expression": "(http.request.uri.path eq \"/api/readiness/submit\" and (http.request.method eq \"POST\" or http.request.method eq \"OPTIONS\"))",
    "description": "readiness submit ingest — skip bot/browser-signature checks (error 1010) for server-to-server automation; path-scoped"
  }'
```

Record the returned rule `id` here when it is created. **Do not** widen the
expression to `/api` or the whole host, and **do not** disable Bot Fight Mode /
Browser Integrity Check zone‑wide.

---

## Verify (against production, default curl UA)

```bash
# 1) POST reaches the origin — expect 400/415/422/200, an API-shaped body, NOT 403/1010
curl -sS -o /tmp/submit.out -w 'status=%{http_code}\n' -X POST \
  'https://www.vygo.ai/api/readiness/submit' \
  -H 'Content-Type: application/json' -d '{}'
grep -q '1010\|Access denied' /tmp/submit.out && echo 'STILL BLOCKED' || echo 'not a CF 1010 block'

# 2) OPTIONS preflight — expect 204/200, not 403/1010
curl -sS -o /dev/null -w 'status=%{http_code}\n' -X OPTIONS \
  'https://www.vygo.ai/api/readiness/submit'

# 3) Sibling non-excepted path — must NOT show a broad exception (expect 404 or CF bot-block)
curl -sS -o /tmp/other.out -w 'status=%{http_code}\n' -X POST \
  'https://www.vygo.ai/api/readiness/other-check' \
  -H 'Content-Type: application/json' -d '{}'

# 4) Regressions
curl -sS -o /dev/null -w 'home=%{http_code}\n' \
  -H 'User-Agent: Mozilla/5.0' 'https://www.vygo.ai/'
curl -sS -w '\nversion above\n' 'https://www.vygo.ai/version'
```

## Remove / roll back

- **Origin change:** revert the commit that removed the shim (or re‑introduce a
  `submit`‑scoped block) — but note the shim was a _fake_ Cloudflare page; there
  is no legitimate reason to restore it.
- **Edge rule (if created later):**

  ```bash
  ZONE=2ccdfc4806d39d840e3601aa1d699aa0
  curl -sS -X DELETE \
    "https://api.cloudflare.com/client/v4/zones/${ZONE}/rulesets/${RULESET}/rules/${RULE_ID}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
  ```

</content>
</invoke>
