# Shared campaign conversion layer

A single conversion layer instruments every Vygo campaign landing page and the
assessment / waitlist / form flows they hand off to. It **reuses** the existing
first-party analytics sink (`lib/analytics.ts` → `trackAnalytics`), the
`vygo:consent` consent contract, and the waitlist/readiness destination
integrations — it does not add a new analytics provider or duplicate any flow.

## Approved campaign parameters (allowlist)

Only these parameters are ever preserved, propagated, or attached to payloads
(`lib/campaign/params.ts` → `ALLOWLISTED_CAMPAIGN_PARAMS`). Any other query
parameter is dropped and never stored.

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- Paid-media click identifiers: `gclid`, `wbraid`, `gbraid`, `fbclid`,
  `msclkid`, `ttclid`, `twclid`, `li_fat_id`

Preservation rules:

- Values are captured on landing-page mount and persisted in `sessionStorage`
  (`vygo:campaign-params:v1`) for the full browser session.
- **Precedence:** an explicit parameter on a later URL replaces the older
  session value; an older session value never overwrites a newer explicit one.
- On same-origin CTA navigation the preserved parameters are appended to the
  destination URL (`appendParamsToHref`), so attribution-capable destinations
  (e.g. `/waitlist`, which reads them via `captureAttribution`) receive them.
  External URLs, `mailto:`, and in-page `#anchor` links are left untouched.

## Event contract

Stable event names (`lib/analytics.ts` → `CAMPAIGN_CONVERSION_EVENTS`, also
listed in the `vygo-analytics-config` script served on every page):

| Event                    | `conversion_outcome`                       | When                                                                              |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `landing_page_view`      | `view`                                     | Exactly once per landing page load                                                |
| `primary_cta_activation` | `activated`                                | Each primary CTA activation                                                       |
| `form_start`             | `started`                                  | First interaction with a conversion form (once per attempt)                       |
| `conversion_error`       | `validation_error` / `submission_rejected` | Accessible client validation failure, or a rejected/failed destination submission |
| `conversion_success`     | `success`                                  | Only after the destination confirms a successful completion                       |

Every payload (`lib/campaign/conversion.ts` → `buildConversionPayload`) carries:

- `landing_page_id` — stable id for the surface (campaign slug, else path).
- `cta_location` — a stable, non-empty string for CTA events; explicit `null`
  when no CTA applies (views, form and error/success events).
- the available allowlisted campaign parameters, spread as top-level keys.
- `conversion_outcome` — the stable outcome above.

## Where it is wired

- The configuration-driven landing route (`/campaign/[slug]`) self-instruments
  through `CampaignShell` → `CampaignConversionProvider` (one `landing_page_view`)
  and `CampaignCtaLink` (`primary_cta_activation` + param-propagated hrefs).
- Every other campaign landing surface under the `/campaigns` path is
  instrumented globally by `CampaignConversionBootstrap`, mounted once in the
  root layout. On every route it preserves the approved parameters for the
  session; on the instrumented paths (`lib/campaign/landing.ts` →
  `isInstrumentedLandingPath`) it emits one `landing_page_view` and emits
  `primary_cta_activation` when a primary CTA (`PRIMARY_CTA_SELECTOR`) is
  activated, deriving a stable `cta_location` (`resolveCtaLocation`) and
  propagating preserved parameters onto same-origin anchor destinations.
- The waitlist destination (`WaitlistForm` + `lib/attribution.ts`) emits
  `form_start`, `conversion_error`, and destination-confirmed
  `conversion_success`, and its submitted attribution falls back to the
  preserved session parameters so attribution survives same-origin navigation.

## Consent and de-duplication

- Analytics/attribution beacons are gated on analytics consent
  (`lib/campaign/consent.ts` → `hasAnalyticsConsent`, reading `vygo:consent`).
  With consent denied, campaign parameters still function for session
  continuity but **no** event is sent. Granting consent enables emission
  without replaying duplicates.
- `landing_page_view` (per landing page), `form_start` and `conversion_success`
  (per attempt) are de-duplicated, so rerenders, repeated event binding,
  back/forward navigation, and retrying a failed submission never create
  duplicate landing-page or successful-conversion events.
- `conversion_success` is emitted **only** on a destination-confirmed success
  (e.g. the waitlist `accepted:true` envelope). Navigation, CTA clicks, form
  starts, optimistic UI, and failed/interrupted requests never count.

## Tests

`apps/web/src/lib/campaign/*.test.ts` (run via `pnpm test:campaign`) cover
allowlisting, session precedence, href propagation, payload shape, consent
gating, de-duplication / false-conversion prevention, instrumented landing-path
detection, and stable `cta_location` resolution.
