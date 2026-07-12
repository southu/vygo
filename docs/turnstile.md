# Cloudflare Turnstile setup

> Live production Turnstile widgets and secrets were **not** provisioned or
> claimed by this repository work. Owner creates widgets and supplies keys per
> environment.

## Why Turnstile is required

`POST /v1/waitlist` verifies a Turnstile token **server-side** using
`TURNSTILE_SECRET_KEY`. There is no request-level bypass in production-strict
mode. The marketing web embeds the public site key via
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

Typed env: `@vygo/config` (`packages/config`).

## Key types

| Key        | Where set                             | Public? |
| ---------- | ------------------------------------- | ------- |
| Site key   | Web: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes     |
| Secret key | API: `TURNSTILE_SECRET_KEY`           | **No**  |

Never put the secret key in the web app, client bundles, or git.

## Local development

Use Cloudflare’s **official always-pass test keys** (safe for local/CI only):

| Role   | Value (public test material)                                                                                                                                                                                  | Env                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Secret | `1x0000000000000000000000000000000AA`                                                                                                                                                                         | `TURNSTILE_SECRET_KEY`           |
| Site   | Cloudflare published always-pass **site** key (from Cloudflare docs: typically `1x0000000000000000000000000000000AA` for visible widget test patterns — confirm in current Cloudflare Turnstile testing docs) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |

Also defined in code for reference:

- Always-pass secret: `CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses` in `packages/config`
- Always-block / already-spent secrets available for negative tests
- Dummy token used in automated tests: `XXXX.DUMMY.TOKEN.XXXX` with the always-pass secret

Root `.env.example` sets the always-pass secret for local API work.

**Do not** use test secrets in real production.

## Staging

1. In Cloudflare Dashboard → Turnstile, create a **staging** widget.
2. Allowed hostnames: staging web host only (e.g. `staging.vygo.ai`).
3. Copy **site key** → Vercel (or host) staging env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. Copy **secret key** → Railway staging API env: `TURNSTILE_SECRET_KEY`.
5. Redeploy web + API.
6. Submit a real waitlist form on staging; confirm API accepts with HTTP 200 when the widget succeeds.
7. Optional: keep `ENABLE_TEST_SURFACE=true` on staging only for inspection routes.

## Production

1. Create a **separate** production Turnstile widget (do not reuse staging keys).
2. Allowed hostnames: production web host(s) only.
3. Site key → production web env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. Secret key → production API env: `TURNSTILE_SECRET_KEY`.
5. Set `ENABLE_TEST_SURFACE=false` and real (non-test) Turnstile secret for production-strict mode.
6. Verify intake end-to-end after deploy; failed Turnstile returns HTTP 400 `TURNSTILE_FAILED`.

## Rotation

1. Create a new widget or rotate secret in Cloudflare.
2. Update API secret first (or both site+secret together during a maintenance window if the pair changes).
3. Update web site key and redeploy web so the widget matches.
4. Confirm staging before production.
5. Revoke/disable the old widget when traffic has moved.

## Checklist by environment

| Environment | Site key env                     | Secret key env         | Widget hostnames     | Test secrets allowed?        |
| ----------- | -------------------------------- | ---------------------- | -------------------- | ---------------------------- |
| Local       | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` | localhost            | Yes (official test)          |
| Staging     | staging value                    | staging value          | staging domain(s)    | No (use real staging widget) |
| Production  | production value                 | production value       | production domain(s) | **No**                       |

Owner must supply real staging and production key pairs; they are listed in
[credentials-and-decisions.md](./credentials-and-decisions.md).
