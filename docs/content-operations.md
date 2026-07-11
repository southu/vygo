# Content operations

Marketing copy lives in centralized typed modules under `apps/web/src/content/`, not scattered across one-off components.

## Content modules

| File                                     | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `site.ts`                                | Brand metadata, primary/footer navigation         |
| `ctas.ts`                                | Approved CTA vocabulary and hrefs                 |
| `flags.ts`                               | Commercial feature flags                          |
| `homepage.ts`                            | Homepage section copy                             |
| `audit.ts` / `method.ts` / `security.ts` | Interior page copy                                |
| `pricing.ts`                             | Audit, build tiers, Ops plans                     |
| `faq.ts`                                 | FAQ items                                         |
| `waitlist.ts`                            | Waitlist + thank-you copy                         |
| `insights.ts`                            | Insight articles (`draft` \| `published`)         |
| `legal.ts`                               | Privacy/terms placeholders + legal-review markers |

## Principles

- Customer-facing language only — no fundraising or confidential deck content.
- No invented customers, testimonials, certifications, or capacity numbers.
- Availability / next-opening values are operational data controlled via `pnpm availability:set` once the database is live.
- Prefer the approved CTA labels in `ctas.ts` site-wide.

## Commercial feature flags

Edit `apps/web/src/content/flags.ts`:

```ts
showPublicPricing: true;
showExactEquityTerms: false;
showCashOnlyPremium: false;
showOpsPricing: true;
showUsBasedClaim: true;
showSeniorOnlyClaim: true;
```

When a commercial capability is disabled, it must disappear from both navigation and page CTAs (no dead links).

Exact equity percentages and cash-only premiums stay unpublished until counsel approves public wording (see comments in `flags.ts`).

## Insights publishing

1. Author or revise the article in `apps/web/src/content/insights.ts`.
2. Keep `status: "draft"` until editorial review is complete.
3. Set `status: "published"` and a real `publishedAt` only after review.
4. Public Insights navigation appears only when at least one article is published.
5. The static export postbuild step removes draft slug HTML so unpublished URLs 404.

## Legal pages

`privacy` and `terms` source files are marked `LEGAL REVIEW: Draft for legal review`. Deployed pages emit `data-legal-review="legal-review-draft"` and visible draft disclaimer text. Do not present them as finalized legal advice until counsel approves.

## Metadata

Page titles and descriptions are centralized in `site.ts` (`metadata` object). Update there first, then verify rendered `<title>` tags.

## Availability

Availability does not live in static content; it comes from the API when wired. Until then the marketing UI uses the safe fallback: join the waitlist for current availability (no invented dates or slot counts).

## Operational runbooks (later missions)

- How to update the next opening: `pnpm availability:set`
- How to resend a failed email job safely
- How to export or delete a waitlist record
- How to change the lead notification inbox

These depend on the API/worker missions and will be expanded when those systems land.
