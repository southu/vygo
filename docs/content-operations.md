# Content operations

Marketing copy should live in centralized content/config modules (later missions), not scattered across one-off components.

## Principles

- Customer-facing language only — no fundraising or confidential deck content.
- No invented customers, testimonials, certifications, or capacity numbers.
- Availability / next-opening values are operational data controlled via `pnpm availability:set` once the database is live.
- Insights articles will use MDX under a dedicated content directory.

## Current state

This mission scaffolds the monorepo only. Full homepage sections, waitlist UX, and MDX insights land in subsequent work.
