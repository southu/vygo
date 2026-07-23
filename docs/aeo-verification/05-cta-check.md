# Check 5 — CTA presence and href targets

Source: https://www.vygo.ai/
Deploy SHA: a9f96c5790985e9bdcdf34a63375b764ea04f970

## See how the rebuild works
- Present: yes
- href: `/method`
- Fetch status: 200

## Apply for the next opening
- Label occurrences in source: 11
- `/waitlist` present in source: True
- Target `/waitlist` HTTP status: 200
- Hero secondary CTA markup (See how…): present with href=/method
- Note: Waitlist-bound CTAs render as availability-aware `<button>` via `ApplyCta`/`CtaLink`; the configured href target is `/waitlist` (see `homepage.hero.primaryCta` and nav `primaryCta`).

## Result: **PASS**