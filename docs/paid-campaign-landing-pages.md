# Paid Campaign & Landing-Page Briefs — vygo.ai

Three source-grounded briefs for paid-acquisition campaigns and their landing
experiences. This document is a **planning artifact for the marketing owner** —
it recommends campaign structure, ad copy, and measurement. It is **not** live
site copy and it does not change the deployed site's design or conversion
behavior.

Prepared: 2026-07-30. Prepared against the vygo repository (`southu/vygo`) and
the live site at <https://www.vygo.ai>.

---

## How to read this document

Every statement is tagged so approved facts are never confused with proposals:

- **`[SOURCED]`** — a direct finding taken from the repository or the live
  site, followed by an exact repository path or an exact `https://www.vygo.ai`
  URL. Treat these as already-approved language, facts, or constraints.
- **`[RECOMMENDATION]`** — a proposal by the author of this brief. Not approved;
  a suggestion for the marketing owner to accept, edit, or reject.
- **`REQUIRES VYGO APPROVAL`** — an explicit marker placed on **every proposed
  claim, headline, description, or wording that is not already published
  approved language.** Any text carrying this marker must be reviewed and
  signed off by vygo before it runs in a live ad or landing page.

Unless a line is tagged `[SOURCED]` with a citation, assume it is a
`[RECOMMENDATION]` that `REQUIRES VYGO APPROVAL` before use.

---

## Guardrails — do not invent (applies to all three campaigns)

These rules are binding on anyone producing creative or landing pages from this
brief. They exist because the repository contains **no customer testimonials,
no named-customer logos, no case studies, and no published performance
outcomes** (the vibe-coding "Case studies" module is explicitly `coming-soon`
— `[SOURCED]` `apps/web/src/content/vibe-coding.ts:56-61`).

Do **NOT** invent, imply, or fabricate any of the following. Each item below is
prohibited unless it becomes approved, cited language:

- **Invented metrics or performance figures** — e.g. conversion lifts, speed
  multiples, uptime percentages, "X% faster," or ROI claims not published on
  the live site. `REQUIRES VYGO APPROVAL` for any new figure.
- **Customer outcomes or results** — no "we helped Company X pass SOC 2," no
  before/after stories, no dollar amounts saved. None exist in the repo.
- **Endorsements, testimonials, quotes, or star ratings** — none exist; do not
  create or paraphrase them.
- **Named-customer logos or "trusted by" walls** — none are approved.
- **Partnership or affiliation claims** with AI tools — prohibited by approved
  language (see Attribution, below).
- **Legal or compliance assurances** — never state or imply a guaranteed SOC 2
  or ISO 27001 certification, audit pass, or legal safety. `[SOURCED]` vygo can
  only claim _readiness_ work, not certification
  (`apps/web/src/content/faq.ts:28-30`; `apps/web/src/content/legal.ts:331-336`).
- **Unsupported product capabilities** — do not claim vygo offers training
  cohorts, an LMS, certifications, a "course," workshops, guaranteed timelines,
  or any capability not present on the live site. vygo's real, published assets
  are: the free Readiness Check, the free Ratchet system guide, the Vibe Coding
  Hub, the Production Readiness Audit, and fixed-price rebuild/Ops engagements.

If a desired claim is not already approved language on the live site, mark it
`REQUIRES VYGO APPROVAL` and route it to vygo before publishing.

---

## Shared source citations (source categories)

The categories below are cited once here and reused by all three campaigns.
Every citation is either an exact repository path or an exact
`https://www.vygo.ai` URL.

### Approved-language sources `[SOURCED]`

- Brand tagline, promise, positioning: `packages/ui/src/index.ts:3-13`
- Home hero, pains, keep/replace, capabilities, CTAs: `apps/web/src/content/homepage.ts`
- Approved CTA vocabulary and destination hrefs: `apps/web/src/content/ctas.ts`
- Method (six phases, QA/UAT, weekly demos, tiers): `apps/web/src/content/method.ts`
- Why vygo (market context, comparison, claims): `apps/web/src/content/why-vygo.ts`
- Pricing / engagements / vygo Harden / Ops: `apps/web/src/content/pricing.ts`
- FAQ (compatibility, audit scope, SOC 2 stance, ownership): `apps/web/src/content/faq.ts`
- Readiness Check flow copy: `apps/web/src/content/readiness.ts`
- Waitlist / apply copy: `apps/web/src/content/waitlist.ts`
- Vibe Coding Hub + the Ratchet loop: `apps/web/src/content/vibe-coding.ts`
- Free Ratchet system guide offer + assurances: `apps/web/src/content/guide-offer.ts`
- Live pages: <https://www.vygo.ai/>, <https://www.vygo.ai/method>,
  <https://www.vygo.ai/why-vygo>, <https://www.vygo.ai/readiness/>,
  <https://www.vygo.ai/waitlist>, <https://www.vygo.ai/vibe-coding>,
  <https://www.vygo.ai/guide>

### Proof sources (permissible proof only) `[SOURCED]`

- Method structure and gates, weekly demos + staging access, dedicated QA/UAT
  Lead on every engagement: `apps/web/src/content/method.ts:6-9,60-82,164`
- Fixed price after audit, full IP handoff, senior-only delivery (behind
  `showSeniorOnlyClaim` flag), security-by-design, ongoing accountability:
  `apps/web/src/content/homepage.ts:221-249`, `apps/web/src/content/why-vygo.ts:65-85`
- Market/industry context statistics (presented on-site as market context, **not**
  as vygo's own results): `apps/web/src/content/why-vygo.ts:7-27`
- Free-guide assurances (free, no signup, no secrets, product-design docs):
  `apps/web/src/content/guide-offer.ts:16-31`
- The Ratchet loop and non-negotiables (live-verify methodology):
  `apps/web/src/content/vibe-coding.ts:109-144`
- **No customer testimonials, logos, case studies, or outcome numbers exist** —
  do not cite proof that is not in this list.

### Imagery / brand sources `[SOURCED]`

- Design tokens (colors, fonts): `packages/ui/src/tokens.css`,
  `packages/ui/src/index.ts:15-31` — purple `#5b47e0`, purpleDark `#4535b8`,
  purpleSoft `#e8e6fa`, green `#12b76a`, amber `#b45309`, canvas `#fafaf8`,
  ink `#16181d`; display font Montserrat, body font Open Sans.
- Wordmark rendering (`vygo` + purple dot + muted `ai`):
  `apps/web/src/components/LogoText.tsx:13-18`
- Logo mark asset (rounded purple square, white "v" check + dot):
  `apps/web/public/favicon.svg`
- Diagram style (inline HTML/SVG, no photography, no Mermaid): the
  "validated prototype → production" figure
  `apps/web/src/components/HeroArchitectureDiagram.tsx`; the Ratchet loop figure
  `apps/web/src/components/VibeLoopDiagram.tsx`
- Readiness data-visual style (gauge/radar/bars):
  `apps/web/src/components/charts/`
- **Note:** the site defines **no** OpenGraph/Twitter social-card image and no
  photographic assets (`apps/web/src/app/layout.tsx:29-45`). Any social/ad
  image is net-new and `REQUIRES VYGO APPROVAL`.

### Conversion-path sources `[SOURCED]`

- Approved CTA labels and hrefs: `apps/web/src/content/ctas.ts:6-32`
  (Readiness destination `https://www.vygo.ai/readiness/`; waitlist `/waitlist`).
- Readiness Check assessment flow (Stage 1 intake → Stage 2 prompt → Stage 3
  paste → results gate → scored snapshot): `apps/web/src/content/readiness.ts`;
  live at <https://www.vygo.ai/readiness/>.
- Waitlist application flow (2-step form → success "You're on the list."):
  `apps/web/src/content/waitlist.ts`; live at <https://www.vygo.ai/waitlist>.
- Free-guide direct download (no login/form):
  `apps/web/src/content/guide-offer.ts:24-31` (`/content/vibe-coding/ratchet-guide-v1.2.zip`).
- First-party analytics event catalog (real event names, same-origin only):
  `apps/web/src/lib/analytics.ts:8-67`.

### Legal / attribution sources `[SOURCED]`

- Tool names describe **compatibility, not formal partnerships**:
  `apps/web/src/content/faq.ts:15`
- Third-Party Services — "A reference does not imply endorsement or partnership":
  `apps/web/src/content/legal.ts:321-328`
- No SOC 2 / certification guarantees; readiness only:
  `apps/web/src/content/faq.ts:28-30`; `apps/web/src/content/legal.ts:331-336`
- Submitting a form does **not** create a client relationship; services begin
  only under a signed agreement: `apps/web/src/content/waitlist.ts:7`,
  `apps/web/src/content/legal.ts:286-292`, `packages/ui/src/index.ts:11-13`
- **No advertising cookies / no cross-context behavioral advertising** on the
  Site; UTM parameters and first-party events are collected:
  `apps/web/src/content/legal.ts:150-160,199-203` (privacy content), and
  professional/marketing data incl. UTM parameters
  `apps/web/src/content/legal.ts:72-74`.
- Site is for people **18 and older**: `apps/web/src/content/legal.ts:246-252`.
- Trademark usage: no `™`/`®` glyphs are used on-site; VYGO LLC owns site
  text/design/diagrams (`apps/web/src/content/legal.ts:313-318`).

> **Attribution baseline for every campaign (binding).** `[SOURCED]` The
> published Privacy Policy states the Site uses **no advertising cookies and no
> cross-context behavioral advertising** (`apps/web/src/content/legal.ts:150-160,199-203`).
> Therefore the default, compliant attribution model is **UTM parameters +
> vygo's first-party same-origin analytics** (`apps/web/src/lib/analytics.ts`).
> Adding any third-party ad pixel or conversion tag (Meta, LinkedIn, Google Ads,
> TikTok, etc.) would contradict current published language and **`REQUIRES VYGO
APPROVAL` plus a Privacy Policy update before launch.** `[RECOMMENDATION]`

> **Brand & voice conventions (binding).** `[SOURCED]` Write the brand name as
> lowercase **`vygo`** in prose and the wordmark; use **`vygo.ai`** as the
> domain/title form; use uppercase **`VYGO LLC`** only for the legal entity
> (`packages/ui/src/index.ts:3-13`, `apps/web/src/components/LogoText.tsx:13-18`,
> `apps/web/src/content/legal.ts`). Do not conflate these paid campaigns with
> the internal operator "Campaign workspace" at `/campaigns`
> (`apps/web/src/content/campaign-workspace.ts`) — that is unrelated ops tooling.

---

# Campaign 1 — AI Production-Readiness Check (assessment)

**Primary conversion: completing the Readiness Check assessment.**

### Target audience `[RECOMMENDATION]`

Founders and technical leads of an **already-working AI-built product**
(built with Lovable, Cursor, Replit, Bolt, v0, or similar) that now has real
users, sensitive data, or an enterprise deal creating production pressure.

- Grounding: the Readiness Check is intended for products that "already have a
  working build and real usage pressure" `[SOURCED]`
  (`apps/web/src/content/readiness.ts:90-93`); compatible stacks are named
  `[SOURCED]` (`apps/web/src/content/homepage.ts:18`, `apps/web/src/content/faq.ts:13-15`).

### Problem state `[SOURCED]` + `[RECOMMENDATION]`

The buyer does not know how production-ready their prototype actually is, and a
concrete risk is looming: a blocking security questionnaire, an IT approval, an
outage when real customers arrive, or key-person code risk.

- Grounding (approved framing): "Not sure how production-ready your prototype
  really is?" and the free diagnostic framing `[SOURCED]`
  (`apps/web/src/content/homepage.ts:37-42`); the four "pains" cards — broke
  under real customers, security questionnaire blocking a deal, IT will not
  approve, only one person understands the code `[SOURCED]`
  (`apps/web/src/content/homepage.ts:43-67`).

### Ad-message angle `[RECOMMENDATION]`

A **free, fast, read-only self-diagnostic** that surfaces security,
scalability, and operational gaps _before_ they cost a deal or an outage —
no code access, no secrets, no code changes.

- Grounding `[SOURCED]`: "a few guided questions surface the security,
  scalability, and operational gaps before they cost you a deal or an outage"
  (`apps/web/src/content/homepage.ts:40`); "no secrets, no code changes"
  (`apps/web/src/content/readiness.ts:7`).

### Sample ad headlines (each `REQUIRES VYGO APPROVAL`)

1. "Is your AI-built app production-ready? Find out free." — `REQUIRES VYGO APPROVAL`
2. "Take the free Readiness Check." — verbatim-adjacent to approved CTA
   "Take the Readiness Check" `[SOURCED]` (`apps/web/src/content/ctas.ts:16`);
   still confirm ad context — `REQUIRES VYGO APPROVAL`
3. "Find the production gaps before your enterprise buyer does." — `REQUIRES VYGO APPROVAL`

### Sample ad descriptions (each `REQUIRES VYGO APPROVAL`)

1. "A few guided questions surface the security, scalability, and operational
   gaps in your prototype — no secrets, no code changes. Get a scored readiness
   report." — adapted from approved copy `[SOURCED]`
   (`apps/web/src/content/homepage.ts:40`, `readiness.ts:7`) — `REQUIRES VYGO APPROVAL`
2. "You proved people want it. See what it takes to make it production-grade —
   free, read-only diagnostic in minutes." — `REQUIRES VYGO APPROVAL`
3. "Built with Lovable, Cursor, Replit, Bolt, or v0? Get a read-only production
   readiness report you can keep." — `REQUIRES VYGO APPROVAL`

### Landing-page promise `[RECOMMENDATION]`

"Answer a few questions and get a scored, read-only production-readiness
report — security, scalability, and operations — with no code access."

- Grounding `[SOURCED]`: "Is your product production-ready? Answer a few
  questions. We'll generate a read-only diagnostic prompt tailored to how you
  build — no secrets, no code changes." (`apps/web/src/content/readiness.ts:5-8`).

### Primary action `[SOURCED]`

**Complete the Readiness Check assessment** — i.e. progress through Stage 1
intake → Stage 2 diagnostic prompt → Stage 3 paste results → the results gate,
arriving at the scored readiness snapshot. The completion moment is the results
gate submit ("Show my results" → scored snapshot)
(`apps/web/src/content/readiness.ts:216-248`).

- **Destination:** <https://www.vygo.ai/readiness/> (`apps/web/src/content/ctas.ts:31`).
- **This campaign's primary conversion is assessment completion — NOT a
  waitlist application.** A recommended engagement/apply CTA appears only
  _after_ the scored snapshot as a downstream, secondary step
  (`apps/web/src/content/readiness.ts:234-235`); it must never be counted as
  this campaign's primary conversion.

### Likely objections (+ approved-fact responses) `[RECOMMENDATION]`

- _"Is this just a lead-gen gate?"_ → It is free and read-only; results are
  shown after a name + work-email gate; no code or secrets are required
  `[SOURCED]` (`readiness.ts:7,216-231`).
- _"Will you see my code / secrets?"_ → No — read-only diagnostic, "no secrets,
  no code changes," secrets are redacted before storage `[SOURCED]`
  (`readiness.ts:7`; `legal.ts:99-107`).
- _"We're too early."_ → If there is no working build yet, the flow off-ramps
  honestly ("come back after MVP") `[SOURCED]` (`readiness.ts:90-94`).
- _"What do I get?"_ → A scored report with top findings and indicative
  engagement ranges, emailable to you `[SOURCED]` (`readiness.ts:232-248`).

### Permissible proof sources `[SOURCED]`

- The free, read-only, no-secrets nature of the check itself (`readiness.ts:7`).
- The five readiness dimensions / "Readiness Radar" scored view
  (`readiness.ts:9-14`; `apps/web/src/components/charts/`).
- Market context statistics — usable **only** as market context, framed as
  industry data, never as vygo's own outcomes: vibe-coding tools market
  `$4.7–7.4B`; `45%` of AI-generated code contains high-risk OWASP Top-10
  issues; `63%` of vibe-coding users are non-developers; `25%` of YC startups
  rely heavily on AI-generated code (`why-vygo.ts:7-27`).
- **Not permitted:** any invented completion rate, accuracy claim, or customer
  outcome for the check.

### Suggested landing-page sections `[RECOMMENDATION]` (all `REQUIRES VYGO APPROVAL`)

1. Hero: promise + "Take the Readiness Check" primary button to the flow.
2. "What a readiness report looks like" — Readiness Radar preview (5 dimensions)
   (`readiness.ts:9-14`).
3. Reassurance strip: free · read-only · no secrets · no code changes.
4. The three-step "how it works" (intake → tailored prompt → paste results).
5. Compatibility line (Lovable, Cursor, Replit, Bolt, v0) with the attribution
   footnote (see Attribution).
6. FAQ (privacy of paste, what you receive) drawn from `readiness.ts` + `legal.ts`.
7. Single primary CTA repeated; no competing waitlist CTA above the snapshot.

### Imagery direction `[RECOMMENDATION]`

Match the existing system exactly: light canvas `#fafaf8`, ink `#16181d`,
purple `#5b47e0` accent; Montserrat display + Open Sans body; inline
diagram/data-viz style (gauge + radar), **no stock photography, no faces, no
Mermaid** — consistent with `HeroArchitectureDiagram.tsx` and the readiness
charts `[SOURCED]` (`packages/ui/src/tokens.css`, `apps/web/src/components/charts/`).
Any new social/ad image is net-new (site has no OG image) and `REQUIRES VYGO APPROVAL`.

### Attribution requirements `[SOURCED]` + `[RECOMMENDATION]`

- Append UTM parameters to every ad URL (captured per privacy policy)
  `[SOURCED]` (`legal.ts:72-74`). `[RECOMMENDATION]` convention:
  `?utm_source=<network>&utm_medium=cpc&utm_campaign=readiness-check&utm_content=<variant>`.
- Attribute conversions via vygo's **first-party** events, not third-party
  pixels (see binding Attribution baseline above).
- Compatibility footnote required wherever tool names appear: tool names
  describe compatibility, **not** partnership or endorsement `[SOURCED]`
  (`faq.ts:15`; `legal.ts:321-328`).

### Measurement plan `[SOURCED]` (events) + `[RECOMMENDATION]` (rates)

- **Primary KPI:** assessment completions = first-party `gate_completed` event
  `[SOURCED]` (`apps/web/src/lib/analytics.ts:21`). Cost per completed
  assessment is the headline efficiency metric.
- **Funnel (real events):** `run_started` → `stage_started` / `stage_completed`
  (Stages 1–3) → `prompt_copied` / `prompt_emailed` → `paste_attempted` →
  `parse_success` → **`gate_completed`** → `bucket_assigned` → downstream
  `cta_clicked`; watch `off_ramp_hit` for not-yet-ready traffic
  `[SOURCED]` (`analytics.ts:8-31`).
- **Rates `[RECOMMENDATION]`:** assessment-start rate (`run_started`/sessions),
  Stage-1→gate completion rate (`gate_completed`/`run_started`), off-ramp rate
  (`off_ramp_hit`/`run_started`) to spot mis-targeted audiences.
- **Do NOT** substitute `waitlist_success` as this campaign's primary
  conversion; the waitlist is downstream only.

---

# Campaign 2 — Scalable learning support for L&D / engineering-enablement leaders

**Primary conversion: a waitlist application.**

> Positioning note `[RECOMMENDATION]`: This campaign uses vygo's **real,
> already-published free learning assets** (the Ratchet system guide and the
> Vibe Coding Hub) as top-of-funnel value, with the waitlist application as the
> conversion. It does **not** claim vygo runs training cohorts, a course, an
> LMS, or certifications — no such capability exists in the repo, and any such
> claim is prohibited (see Guardrails). Framing vygo's assets as "learning
> support for L&D/enablement leaders" is an audience expansion beyond current
> published positioning and therefore `REQUIRES VYGO APPROVAL`.

### Target audience `[RECOMMENDATION]` — `REQUIRES VYGO APPROVAL`

L&D leaders, engineering-enablement / developer-experience leads, and people/ops
leaders at organizations where **multiple teams are shipping AI-built
prototypes** and need a consistent, self-serve way to raise production quality.

- Grounding for the underlying reality (not the audience label): the free guide
  and hub are self-serve, free, no-signup learning resources `[SOURCED]`
  (`guide-offer.ts:16-31`, `vibe-coding.ts:78-93`).

### Problem state `[RECOMMENDATION]` (grounded) — `REQUIRES VYGO APPROVAL`

Teams can vibe-code working prototypes fast, but quality and production
discipline are inconsistent across teams, and there is no shared, verifiable
"build-and-verify" playbook to standardize on. Enablement leaders need
something scalable and free to point every team at — without hiring for it.

- Grounding `[SOURCED]`: the Ratchet loop and non-negotiables describe a
  repeatable build-and-verify discipline ("Live is truth," small verifiable
  steps, no mega-prompt) (`vibe-coding.ts:109-144`); key-person risk is a named
  pain ("Only one person understands the code")
  (`homepage.ts:60-63`).

### Ad-message angle `[RECOMMENDATION]` — `REQUIRES VYGO APPROVAL`

"Give every team the same free build-and-verify playbook" — a scalable,
self-serve learning path (the Ratchet system guide + Vibe Coding Hub) to
standardize how teams take AI-built software from prototype toward production,
then bring in vygo when a product needs a real production rebuild.

### Sample ad headlines (each `REQUIRES VYGO APPROVAL`)

1. "Give every team a free build-and-verify playbook for AI-built software."
2. "Your teams ship prototypes fast. Standardize what happens next — free."
3. "The Ratchet system guide: a free, self-serve production playbook." —
   leans on approved asset name `[SOURCED]` (`guide-offer.ts:14-16`).

### Sample ad descriptions (each `REQUIRES VYGO APPROVAL`)

1. "A free, no-signup guide and hub that teach the build-and-verify loop for
   AI-built software. Standardize quality across teams — then apply to bring in
   senior production engineering." — grounded in `guide-offer.ts:16-31`,
   `vibe-coding.ts`.
2. "No paywall, no login: the complete Ratchet system guide plus the Vibe Coding
   Hub. Level up how your teams take prototypes to production." — grounded in
   `guide-offer.ts:16-31`.
3. "When a product outgrows the playbook, apply for the next production
   opening." — uses approved CTA `[SOURCED]` (`ctas.ts:7`).

### Landing-page promise `[RECOMMENDATION]` — `REQUIRES VYGO APPROVAL`

"A free, self-serve learning path — the Ratchet system guide and Vibe Coding Hub
— to give every team a shared build-and-verify discipline, with a direct path
to senior production engineering when a product is ready."

- Grounding `[SOURCED]`: guide is "free — the full v1.2 pack, no signup and no
  paywall … product-design documentation" (`guide-offer.ts:16-22`); the hub
  teaches "the loop, the rules, and the guide" (`vibe-coding.ts:81-83`).

### Primary action `[SOURCED]` destination + `[RECOMMENDATION]` framing

**Submit a waitlist application** ("Apply for the next opening").

- **Destination:** <https://www.vygo.ai/waitlist> (`ctas.ts:7,23-24`).
- Free-guide download (`/content/vibe-coding/ratchet-guide-v1.2.zip`) and hub
  engagement are **assist actions**, not the primary conversion
  `[SOURCED]` (`guide-offer.ts:24-31`).

### Likely objections (+ approved-fact responses) `[RECOMMENDATION]`

- _"Is the guide gated?"_ → No — free, no signup, no paywall, no secrets
  `[SOURCED]` (`guide-offer.ts:16-31`).
- _"Is this a course / certification?"_ → No. It is product-design
  documentation and a hub, not training, an LMS, or certification `[SOURCED]`
  (`guide-offer.ts:20-22`). (Do not imply otherwise — see Guardrails.)
- _"What happens when we apply?"_ → An application does not create a client
  relationship; vygo reviews it against the next available opening; work begins
  only under a signed agreement `[SOURCED]`
  (`waitlist.ts:7,49-53`; `legal.ts:286-292`).

### Permissible proof sources `[SOURCED]`

- The free-guide assurances (free, no signup, no secrets, product-design docs):
  `guide-offer.ts:16-31`.
- The Ratchet loop + non-negotiables as evidence of a real, teachable method:
  `vibe-coding.ts:109-144`.
- The Vibe Coding Hub topic set (guide available; other modules `coming-soon` —
  label them honestly as upcoming): `vibe-coding.ts:19-76`.
- **Not permitted:** learner counts, "teams trained," satisfaction scores, or
  any outcome numbers — none exist.

### Suggested landing-page sections `[RECOMMENDATION]` (all `REQUIRES VYGO APPROVAL`)

1. Hero: the shared-playbook promise + primary "Apply for the next opening" CTA.
2. "What it is / what it is not" mirrored from the hub definition
   (`vibe-coding.ts:94-108`).
3. Free assets strip: guide (no signup) + hub, with honest `coming-soon` labels.
4. The Ratchet loop diagram (build → live deploy gate → test → streak).
5. "For enablement leaders" band: scalable, self-serve, free — `REQUIRES VYGO APPROVAL`.
6. Conversion band: apply for the next opening (waitlist) as the single primary CTA.

### Imagery direction `[RECOMMENDATION]`

Reuse the Ratchet-loop visual language (numbered purple step nodes, inline SVG
arrows, amber fail-note) from `VibeLoopDiagram.tsx` and the shared tokens
(purple `#5b47e0`, canvas `#fafaf8`, Montserrat/Open Sans) `[SOURCED]`
(`apps/web/src/components/VibeLoopDiagram.tsx`, `packages/ui/src/tokens.css`).
No stock photos/faces; diagram-led. New social/ad imagery `REQUIRES VYGO APPROVAL`.

### Attribution requirements `[SOURCED]` + `[RECOMMENDATION]`

- UTM on all URLs `[SOURCED]` (`legal.ts:72-74`); `[RECOMMENDATION]`
  `utm_campaign=learning-enablement&utm_content=<variant>`.
- First-party attribution only; third-party pixels `REQUIRES VYGO APPROVAL` +
  privacy update (binding baseline above).
- Any tool names carry the compatibility-not-partnership footnote `[SOURCED]`
  (`faq.ts:15`; `legal.ts:321-328`).

### Measurement plan `[SOURCED]` (events) + `[RECOMMENDATION]` (rates)

- **Primary KPI:** waitlist applications = first-party **`waitlist_success`**
  event `[SOURCED]` (`analytics.ts:60`). Cost per application is the headline
  efficiency metric.
- **Funnel (real events):** ad click → `waitlist_form_view` →
  `waitlist_step_change` → `waitlist_submit` → **`waitlist_success`**; assist
  signals: free-guide zip downloads and hub page depth `[SOURCED]`
  (`analytics.ts:56-62`; `guide-offer.ts:24-31`).
- **Rates `[RECOMMENDATION]`:** application rate (`waitlist_success`/sessions),
  form-completion rate (`waitlist_success`/`waitlist_form_view`),
  assist-to-apply rate (applications among guide downloaders).
- Distinct from Campaign 1: the primary conversion is a **waitlist application**
  (`waitlist_success`), never assessment completion.

---

# Campaign 3 — Workforce capability & builder engagement for engineering leaders

**Primary conversion: a waitlist application.**

> Positioning note `[RECOMMENDATION]`: This campaign targets engineering leaders
> responsible for their team's ability to ship production-grade AI-built
> software and for keeping builders engaged instead of firefighting fragile
> prototypes. It is grounded in vygo's published claim that engagements leave
> the team "a codebase your team can own" (documentation, runbooks, tests) —
> **not** in any training/upskilling product, which does not exist. Any
> "capability uplift / workforce enablement" framing beyond the codebase-
> ownership claim `REQUIRES VYGO APPROVAL`.

### Target audience `[RECOMMENDATION]` — `REQUIRES VYGO APPROVAL`

Heads of Engineering, VPs of Engineering, and CTOs whose developers ship
AI-built software quickly but hit a **capability gap** at production — security,
reliability, ownership — and whose builders are stuck maintaining fragile
systems only one person understands.

- Grounding for the reality (not the label): "Only one person understands the
  code" and the capabilities AI tools do not provide `[SOURCED]`
  (`homepage.ts:60-63,94-122`).

### Problem state `[SOURCED]` + `[RECOMMENDATION]`

The team can build fast but cannot carry products to enterprise-grade
production on its own: fragile auth, no environment separation, missing tests,
console-log debugging, key-person risk. This caps both product outcomes and the
team's growth.

- Grounding `[SOURCED]`: the "We replace or harden" list (auto-generated
  monoliths, fragile auth, one-click infra, manual deploys, missing tests,
  console-log debugging, unmanaged secrets) (`homepage.ts:81-90`); "the
  production layer AI tools do not provide by themselves" (`homepage.ts:94-95`).

### Ad-message angle `[RECOMMENDATION]` — `REQUIRES VYGO APPROVAL`

"Close the gap between shipping prototypes and shipping production-grade
software." Senior engineers rebuild the foundation _and_ hand your team a
codebase they can own — architecture docs, runbooks, tests — so the workforce's
capability lifts with the product. Fixed method, senior-only, full IP handoff.

- Grounding `[SOURCED]`: "A codebase your team can own … full ownership of the
  code, infrastructure, and IP at handoff" (`homepage.ts:117-120`); senior-only
  delivery, fixed price after audit, full IP handoff (`homepage.ts:221-249`).

### Sample ad headlines (each `REQUIRES VYGO APPROVAL`)

1. "Your team ships prototypes. We help them ship production-grade software."
2. "Turn a codebase only one person understands into one your whole team owns."
   — grounded in approved pains/claims `[SOURCED]` (`homepage.ts:60-63,117-120`).
3. "Senior engineers rebuild the foundation — and hand your team the keys."

### Sample ad descriptions (each `REQUIRES VYGO APPROVAL`)

1. "vygo re-engineers the foundation beneath your AI-built product and hands off
   architecture docs, runbooks, tests, and full IP — so your team can own it.
   Apply for the next opening." — grounded in `homepage.ts:117-120,230-231`;
   CTA from `ctas.ts:7`.
2. "Fixed methodology, senior-only delivery, fixed price after a two-week audit.
   Close the gap between prototype and production." — grounded in
   `method.ts:5-9`, `homepage.ts:167-183,221-249`.
3. "Weekly demos and staging access, independent QA/UAT on every build, full IP
   at handoff." — grounded in `method.ts:6-9,60-82,164`.

### Landing-page promise `[RECOMMENDATION]` — `REQUIRES VYGO APPROVAL`

"Turn a team that ships prototypes into a team that ships production-grade
software — with a fixed method, senior-only delivery, and a codebase your team
can own."

- Grounding `[SOURCED]`: fixed methodology (`method.ts:5-9`); codebase your
  team can own + full IP handoff (`homepage.ts:117-120`).

### Primary action `[SOURCED]` destination + `[RECOMMENDATION]` framing

**Submit a waitlist application** ("Apply for the next opening").

- **Destination:** <https://www.vygo.ai/waitlist> (`ctas.ts:7,23-24`;
  `why-vygo.ts:86-91`).
- Recommended supporting pages (existing, live): `/method`, `/why-vygo` as
  pre-conversion reading; the single primary action remains the waitlist
  application.

### Likely objections (+ approved-fact responses) `[RECOMMENDATION]`

- _"Will you throw away what we built?"_ → No — validated UX, workflows, product
  rules, and useful data are kept; the audit maps keep-vs-rebuild `[SOURCED]`
  (`faq.ts:8-10`; `homepage.ts:68-93`).
- _"Open-ended consulting?"_ → No — a fixed methodology; fixed price after a
  two-week audit `[SOURCED]` (`method.ts:5-9`; `homepage.ts:167-183`).
- _"Who tests it?"_ → A dedicated QA & UAT Lead, separate from the engineers,
  on every engagement `[SOURCED]` (`faq.ts:53-56`; `method.ts:60-82`).
- _"Do we get locked in?"_ → Full IP handoff; documentation lets another
  qualified team take over `[SOURCED]` (`homepage.ts:117-120,230-231`).
- _"Can you guarantee SOC 2?"_ → No — vygo does readiness work; no firm can
  guarantee an auditor's decision `[SOURCED]` (`faq.ts:28-30`; `legal.ts:331-336`).

### Permissible proof sources `[SOURCED]`

- The fixed six-phase method with gates, weekly demos + staging access, and the
  dedicated QA/UAT Lead on every build: `method.ts:6-9,60-82,164`.
- Approved differentiators: senior-only delivery (behind `showSeniorOnlyClaim`
  flag), fixed price after audit, security by design, full IP handoff, ongoing
  accountability: `homepage.ts:221-249`; `why-vygo.ts:65-85`.
- "Keep / replace-or-harden" capability lists: `homepage.ts:68-122`.
- Market context statistics (industry framing only, not vygo outcomes):
  `why-vygo.ts:7-27`.
- **Not permitted:** delivery-speed claims, success rates, retention numbers,
  named customers, or capability-uplift metrics — none exist.

### Suggested landing-page sections `[RECOMMENDATION]` (all `REQUIRES VYGO APPROVAL`)

1. Hero: the prototype→production-capability promise + "Apply for the next
   opening" primary CTA.
2. "The production layer AI tools do not provide" capability grid
   (`homepage.ts:94-122`).
3. "We keep / we replace or harden" two-column band (`homepage.ts:68-93`).
4. Fixed-method strip (six phases) with the QA/UAT-on-every-build note
   (`method.ts`).
5. "A codebase your team can own" band — docs, runbooks, tests, full IP handoff.
6. Objection/FAQ band; single primary waitlist CTA repeated.

### Imagery direction `[RECOMMENDATION]`

Lead with the "validated prototype → vygo production layer → production
platform" three-column figure language (amber validated dots, purple arrow
node, green production dots) from `HeroArchitectureDiagram.tsx`, on the shared
tokens `[SOURCED]` (`apps/web/src/components/HeroArchitectureDiagram.tsx`,
`packages/ui/src/tokens.css`). Diagram-led, no photography. New social/ad
imagery `REQUIRES VYGO APPROVAL`.

### Attribution requirements `[SOURCED]` + `[RECOMMENDATION]`

- UTM on all URLs `[SOURCED]` (`legal.ts:72-74`); `[RECOMMENDATION]`
  `utm_campaign=workforce-capability&utm_content=<variant>`.
- First-party attribution only; third-party pixels `REQUIRES VYGO APPROVAL` +
  privacy update (binding baseline above).
- Compatibility-not-partnership footnote wherever tool names appear `[SOURCED]`
  (`faq.ts:15`; `legal.ts:321-328`).

### Measurement plan `[SOURCED]` (events) + `[RECOMMENDATION]` (rates)

- **Primary KPI:** waitlist applications = first-party **`waitlist_success`**
  event `[SOURCED]` (`analytics.ts:60`). Cost per application is the headline
  efficiency metric.
- **Funnel (real events):** ad click → `/method` or `/why-vygo` views →
  `waitlist_form_view` → `waitlist_step_change` → `waitlist_submit` →
  **`waitlist_success`** `[SOURCED]` (`analytics.ts:56-62`).
- **Qualification signal `[RECOMMENDATION]`:** weight applications whose stage
  is `live_users`, `revenue`, or `enterprise_pipeline` (the form's own stage
  options) as higher-intent `[SOURCED]` (`waitlist.ts:13-19`).
- **Rates `[RECOMMENDATION]`:** application rate (`waitlist_success`/sessions),
  qualified-application rate, method/why-vygo-assisted application rate. Use a
  qualified-application definition distinct from Campaign 2 (enablement-led)
  so the two waitlist campaigns are not measured identically.

---

## Cross-campaign summary (distinctness check)

| Dimension         | Campaign 1                                                     | Campaign 2                                                   | Campaign 3                                                            |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Audience          | Founders/tech leads of a working AI-built product              | L&D / enablement / DX leaders                                | Heads of Eng / VP Eng / CTO                                           |
| Problem           | Don't know their production readiness; a deal/outage looms     | No shared, scalable build-and-verify discipline across teams | Capability gap: can't carry prototypes to production; key-person risk |
| Angle             | Free read-only self-diagnostic                                 | Give every team the same free playbook                       | Close the prototype→production capability gap                         |
| Landing promise   | Get a scored readiness report, no code access                  | Free self-serve learning path + path to engineering          | Prototype team → production team, with a codebase you own             |
| Primary action    | **Complete the Readiness Check assessment** (`gate_completed`) | **Waitlist application** (`waitlist_success`)                | **Waitlist application** (`waitlist_success`)                         |
| Destination       | <https://www.vygo.ai/readiness/>                               | <https://www.vygo.ai/waitlist>                               | <https://www.vygo.ai/waitlist>                                        |
| Primary KPI event | `gate_completed`                                               | `waitlist_success`                                           | `waitlist_success`                                                    |

Campaign 1's primary conversion is **assessment completion** and must never be
reported as a waitlist conversion. Campaigns 2 and 3 both convert on a
**waitlist application** but use different audiences, problem states, angles,
promises, and measurement definitions (enablement-led vs. capability/qualified-
application-led), per the guardrail against a single generic template.

_End of brief. Every `REQUIRES VYGO APPROVAL` item must be reviewed by vygo
before any live ad or landing page uses it. Do not invent metrics, customer
outcomes, endorsements, legal assurances, or product capabilities._
