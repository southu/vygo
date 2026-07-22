# Queue Builder goal — vygo Readiness Check

**Use:** On Build, set folder **`vygo`**, turn **Provision ON**, and paste the short pointer below (or tell the planner to read this file). Do not ask clarifying questions; draft 8 steps from this document.

**Short paste for Build (if you cannot paste this whole file):**

```text
Folder: vygo. Provision ON. Draft immediately (phase=draft). Do NOT ask clarifying questions.
Read and follow the full goal specification at:
/opt/projects/vygo/QUEUE-BUILDER-GOAL-readiness-check.md
Produce exactly 8 ordered queue steps as specified in that file. ready_to_confirm true when done.
```

---

Folder: vygo. Draft immediately (phase=draft). Do NOT ask clarifying questions. Produce exactly 8 ordered queue steps (not one mega-mission). Each step request must be a full plain-language mission with repo, live URL, constraints, provisioning rules, and explicit Done when. Order by dependency. Deploy each step via main; confirm https://www.vygo.ai/version after each deploy. Never invent laptop paths. Never put secrets, tokens, connection strings, or API keys in mission text, commits, client code, or logs.

PROJECT (authoritative):

- project_folder: vygo
- repo: https://github.com/southu/vygo.git
- live_url: https://www.vygo.ai
- version_endpoint: /version
- deploy branch: main
- Railway project already exists and is bound in project.json (UUID 1b8abe52-f665-4e07-9a99-f6aa36a62610). REUSE ONLY — do not create a new Railway project, do not create a second Postgres, do not destroy services.
- Public API is reached via https://www.vygo.ai (Vercel edge → Railway). Do NOT use api.vygo.ai (DNS does not resolve). Match existing route style (/v1/... and/or /api/... like waitlist/apply).
- Sync to origin/main and the live /version SHA before editing. Deploy via composer-origin / git main — do not only edit live.

PROVISIONING (user toggled ON — include in every step request):

- architect.enabled: true (tools: none)
- provision.enabled: true, provider railway, project_name vygo
- allowlist project_names: [vygo], create_project true only if project missing (prefer reuse of bound project_id; never create duplicate same-name shells), destroy false
- Fail closed on vault_locked / consumer_not_armed / vault_access_denied — stop and report, do not work around
- Builder uses non-secret provision summary only; all secrets (DATABASE_URL, RESEND__, TURNSTILE__, optional ANTHROPIC/LLM key) flow through Vault / Railway env only

DATABASE (required — do not under-scope this):

- New readiness data lives as schema migrations on the EXISTING Railway Postgres for project vygo (same DB already used by waitlist/applications; live /readyz shows database connected).
- Add packages/db migrations + typed access for e.g. readiness_sessions (draft state, resumable token, stage), readiness_submissions (parsed JSON, raw redacted paste, scores, bucket, flags, contact), readiness_question_bank + readiness_scoring_config (rules/weights as data/seed).
- Apply migrations so live API can read/write the new tables. Client never writes to Postgres directly — all writes via server endpoints.
- DB-touching steps must prove durability where relevant (insert + read-back, and/or vault-provisioner-query SELECT path like apply e2e — secrets never in artifacts).
- Raw pastes: redact before store; document 90-day retention intent (full purge job may be minimal/stub in v1).

PRODUCT: “vygo Readiness Check” (public), internal name readiness
URL: https://www.vygo.ai/readiness
Self-serve interactive assessment that routes prospects into Harden / Launch / Scale / Enterprise and produces a Production Readiness Snapshot. Differentiator: form generates a diagnostic prompt tailored to their AI build tool (Lovable, Cursor, Replit, Bolt, v0, Claude Code, Windsurf, etc.); user runs it on their codebase, pastes AI output back; we parse, ask dynamic follow-ups, score, and recommend a bucket + indicative price range. Primary CTA is the $15K Production Readiness Audit (or free Harden assessment when bucket = Harden) into the existing apply/waitlist flow with prefilled data / offer key.

NON-GOALS (hard):

- Does NOT replace the paid audit. Snapshot is directional (“which bucket”); audit is definitive (“exactly what changes, fixed price, in writing”). Never output a remediation roadmap or how-to-fix blueprint.
- No GitHub App / automated repo access in v1 (schema should allow a machine-generated report later).
- No CRM/Slack integration in v1 (email + DB row + minimal internal list is enough).
- No public share badges, multi-language, or A/B framework (instrument only).

BUSINESS PRIORITY: (1) qualify/route leads (2) capture high-fidelity tech pre-sales intel from the paste (3) shareable diagnostic prompt as marketing (4) filter not-a-fit without a sales call.

USER FLOW:
Landing → Stage 1 About your product (5 questions) → Stage 2 tailored diagnostic prompt (copy / email me prompt+resume / can’t-run fallback) → Stage 3 paste-back, parse, “here’s what we learned” confirmation → Stage 4 3–6 dynamic follow-ups → email gate → Stage 5 Readiness Snapshot (scores, bucket, indicative range, CTA → apply for audit / Harden).
Target under 10 minutes including the AI round-trip. Form must survive the round-trip: persist all state (localStorage + server-side draft keyed by resumable token) so multi-tab / next-day resume works. “Email me my prompt” sends prompt + resume link.

STAGE 1 (no gate) — five questions, mobile-first:

1. What does your product do? free text, 200 char max
2. Who uses it today? Just me / My internal team / External users free / External users paying / Enterprise customers or enterprise sales cycle
3. Primarily built with? Lovable / Cursor / Replit / Bolt / v0 / Claude Code / Windsurf / Mixed–multiple tools / Other–hand-written / Not built yet
4. What’s blocking you? multi-select max 2: broke or struggles with real usage / security questionnaire or review blocking a deal / customer IT won’t approve rollout / only one person understands the code / nothing broken — want solid before launch / mainly need new features built
5. Deadline or live deal? Yes within 30 days / Yes within 90 days / No hard deadline; if yes, optional free text what it’s tied to
   Immediate routing:

- Q3 = Not built yet → polite off-ramp (not a fit yet, invite back post-MVP); log lead; do not continue the flow
- Q4 includes ONLY “mainly need new features” → soft off-ramp (vygo rebuilds foundations, not feature work) but allow continue if they also have reliability/security concerns

STAGE 2 — diagnostic prompt:

- Variant A (agent with repo access): Cursor, Claude Code, Windsurf, Mixed, Other — “open AI coding agent in project root and paste”
- Variant B (builder chat): Lovable, Replit, Bolt, v0 — mark unverifiable as UNKNOWN
- Interpolate tool name; short 3-step how-to for selected tool
- Monospace prompt + one-click Copy (confirm state on click); secondary “Email me this prompt” (early email + resume link); “Can’t run this?” → fallback manual questionnaire
- Reassurance line: read-only; never asks AI to change code; excludes secrets, keys, customer data
- Shared schema module used by both prompt generator and parser (no drift). Schema version in header/footer:
  === VYGO-READINESS-REPORT v1 === … === END VYGO-READINESS-REPORT ===
  Fixed fields (versioned contract — do not rename without versioning): summary, languages, size, structure, frontend, backend, database, tenancy, auth, authorization, row_level_security, environments, deploys, tests, background_jobs, integrations, secrets_pattern, logging, error_handling, pii_categories, api_surface, fragility_flags, confidence
- Prompt RULES fixed: read-only; never include secrets/values; UNKNOWN if unverifiable; grade vs production standards; output ONLY the report block
- Fallback manual ~10 plain-language questions → same internal schema with confidence=low, source=manual; wider indicative ranges for manual-source

STAGE 3 — paste-back and parsing:

- Large textarea; accept sloppy pastes (chat wrap, markdown fences, missing footer)
- Client secret scan BEFORE send (high-confidence patterns only: sk-…, AKIA…, JWT eyJ…, postgres://user:pass@, PRIVATE KEY blocks, clear api_key/secret/token assignments with long secret-shaped values). On hit: block submit, highlight lines, “Remove secrets before submitting.” Avoid false-blocking benign structure talk. Server: same scan; redact to [REDACTED] before storage; log redaction events
- Deterministic parse of delimited block; validate fields
- Optional LLM normalization fallback (Anthropic Sonnet-class or existing stack LLM): ONLY after redaction; schema-strict JSON; UNKNOWN for missing. If ANTHROPIC/LLM key missing: fail closed to deterministic parse + manual questionnaire — do not block the whole feature on LLM
- Store parsed JSON + raw redacted paste on submission/session
- Confirmation screen: “Here’s what we learned” (stack, size, 4–6 findings); Looks right → continue / Something’s off (re-paste or edit key fields)

STAGE 4 — dynamic follow-ups (question bank as seed/data):
Always: users today + expected 12 months (ranges); what “done” looks like (short free text); budget (<$25K / $25–75K / $75–150K / $150K+ / no idea yet)
Conditional: security questionnaire framework (SOC2/ISO/HIPAA/etc.); tests run on every deploy cross-check; payment/health PII in production; SSO/SAML for multi-tenant/enterprise; who deploys if manual/one-click; repo access for audit if low confidence/manual
Contradictions with report set internal discrepancy flag — never shown to user

STAGE 5 — email gate then snapshot:
Gate only scored results (prompt itself is NOT gated). Name + email required, company optional, privacy consent. Reuse existing Turnstile — do not invent a new CAPTCHA product.
Five dimensions 0–100 (weights in config/seed, not hardcoded magic only): Security, Reliability, Operability, Maintainability, Compliance posture. UNKNOWN fields score as risk (~25th percentile), not neutral. Manual-source shows ranges rather than point scores.
Buckets top-down, first match wins: Not a fit → Enterprise → Scale → Launch → Harden → unresolved defaults to Launch with “talk to us” caveat (rules from product spec: multi-tenant/enterprise/SSO/compliance pressure → Enterprise; security questionnaire + paying users + weak reliability/compliance → Scale; external users + foundational gaps → Launch; internal-only solid tool → Harden; features-only / not built already off-ramped).
Snapshot contents: five-dimension scorecard (radar or bars, on-brand); recommended engagement + 2–3 sentence reasoning citing their actual data; indicative ranges from published pricing (Harden $9,500 fixed · Launch from $75K · Scale from $145K · Enterprise $275K+); explicit that audit locks scope and price; $15K audit credited toward build; top 3 findings headline-only — NEVER how-to-fix; primary CTA Apply for next audit opening OR Start free Harden assessment when Harden → existing apply/waitlist prefilled + offer key; secondary emailed snapshot copy (HTML/PDF ok).

ARCHITECTURE (match monorepo):

- apps/web Next.js on Vercel: /readiness route group, design system, mobile-first
- apps/api on Railway via www.vygo.ai: e.g. POST /v1/readiness/session, PATCH /v1/readiness/session/:token, POST /v1/readiness/parse, POST /v1/readiness/score, GET /v1/readiness/snapshot/:id (names may match repo conventions; keep /v1 style)
- packages/db migrations + packages/validation schemas; packages/email templates for prompt+resume, snapshot, internal lead
- Rate-limit parse/score; no third-party analytics on textarea contents
- Privacy page: short update describing this data flow (late step ok)
- Match existing Turnstile, Resend/outbox worker, CORS, and apply/waitlist patterns

INTERNAL (v1 minimal):
On complete: structured internal brief (template from structured data first; LLM polish only if key present) with company/contact/source, product one-liner, tool, blockers, deadline, score summary + bucket + reasoning, parsed tech report, follow-ups/budget, discrepancy flags, 3 talking points. Store + email ops. Minimal internal list: filter by bucket/date, view brief, CSV export. No full CRM.

ANALYTICS events: stage_started/completed per stage, prompt_copied, prompt_emailed, fallback_taken, paste_attempted, secret_scan_blocked, parse_success/normalized/failed, session_resumed, gate_completed, bucket_assigned (with value), cta_clicked, off_ramp_hit (with reason).

OUT OF SCOPE FOR AUTOMATED ACCEPTANCE (owner/human — do not fail missions on these):

- Running diagnostic prompts against 5+ external real repos across tools before UI
- Founder calibration workshops / “founder said scores match”
- Soft-launch friend-cohort ops
- Live CRM/Slack wiring

REQUIRED 8 STEPS (use these; titles may be shortened; each step request must restate project pins + provision + DB reuse rules):

1. Schema + DB migrations + session API
   Add readiness migrations on EXISTING Railway Postgres; shared report schema module; session create/resume/PATCH draft endpoints; rate limits. Apply migrations via Vault/provision path. Done when: create session, save stage state, resume by token works on deployed API via www.vygo.ai; tables exist (prove via API read-back and/or vault-provisioner-query); /version bumped.

2. Stage 1–2 UI + prompt variants + copy + email-me-prompt
   /readiness Stage1 questions, routing off-ramps (log off-ramp leads), Stage2 prompt variants A/B, copy button, email-me-prompt + resume link via existing email stack, can’t-run entry to fallback. Persist localStorage + server draft. Done when: live mobile flow through Stage2; copy works; email path sends or safely uses existing mock policy; sessions durable in DB; /version bumped.

3. Fallback manual questionnaire + Stage3 paste UI
   Manual Qs mapping to schema; paste textarea; client secret scan; confirmation “what we learned” with looks-right / something’s-off. Done when: live UI works; planted fake secret blocked client-side; draft state survives reload; /version bumped.

4. Parse pipeline + Stage4 follow-ups
   Server secret scan + redaction before store/LLM; deterministic parser + golden fixtures in repo; optional LLM normalize fail-closed if no key; dynamic follow-ups from seed question bank; discrepancy flags stored. Done when: fixture pastes parse in tests and via live API; sloppy fixture recovered or routes to manual; redacted paste never stores credential-shaped strings unredacted; /version bumped.

5. Gate + scoring + snapshot + CTA prefill
   Email gate + existing Turnstile; scoring config seed; deterministic bucketing; snapshot page with no remediation detail; published indicative pricing; CTA into existing apply/waitlist with prefill and offer=harden when Harden. Done when: full happy-path on live to snapshot; correct CTA; score/bucket persisted on submission row; planted secret never stored unredacted; /version bumped.

6. Emails + internal brief notification
   Templates: prompt+resume, snapshot to applicant, internal brief to ops. Prefer structured-data brief; LLM polish only if key present. Done when: completed test submission creates durable submission row and triggers email/outbox jobs (or documented mock) and internal brief row; /version bumped.

7. Internal list + CSV export (minimal dashboard)
   Ops-only surface consistent with repo patterns: list submissions, filter by bucket/date, view brief, export CSV. Done when: completed test row visible and exportable on live or documented ops route; /version bumped.

8. E2E guards + privacy blurb + analytics
   Automated checks for session resume, secret plant block/redact, fixture parse, bucket fixtures, no-remediation copy guard, key analytics events; privacy page short blurb for readiness data flow. Done when: repo tests/checks pass; live smoke of resume + blocked secret + snapshot; /version bumped.

GLOBAL CONSTRAINTS FOR EVERY STEP:

- Match existing vygo design system and packages (validation, db, email, config)
- Prefer smaller shippable steps; site remains deployable after each step
- No equity marketing; no SLA promises; no remediation blueprints on snapshot
- Tester acceptance must be machine/browser checkable on https://www.vygo.ai — no “founder approved” or “real Lovable founder completed in 10 minutes” criteria
- If provision fails closed, stop and report — do not invent DATABASE_URL or bypass Vault

After drafting, set ready_to_confirm true so I can Load into the vygo queue.
