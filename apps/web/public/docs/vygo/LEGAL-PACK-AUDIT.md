# Vygo legal pack inventory and issues audit

**Audit date:** 2026-07-12

**Repository source path:** `docs/vygo/LEGAL-PACK-AUDIT.md`

**Public path:** `/docs/vygo/LEGAL-PACK-AUDIT.md` (the deployed static site publishes `apps/web/public/` under the `/docs` prefix; this differs from the preferred `/vygo/...` path)

**Scope:** Inventory and issue checklist only. This note does not approve, rewrite, or replace any policy text and is not legal advice.

## Full inventory

### Files under `docs/vygo/`

| Path | Role | Scope note |
| --- | --- | --- |
| `docs/vygo/privacy-policy.md` | Privacy Policy (including cookie/analytics disclosures) | Reviewed in full. |
| `docs/vygo/terms-of-use.md` | Terms of Use (including Acceptable Use) | Reviewed in full. |
| `docs/vygo/LEGAL-PACK-AUDIT.md` | Supporting audit/checklist | This audit artifact; not an operative legal policy. |

There are no standalone Acceptable Use Policy, Cookie Policy, Data Processing Addendum (DPA), or other policy files under `docs/vygo/`. Acceptable-use language is embedded in the Terms, and cookie/analytics language is embedded in the Privacy Policy.

### Closely related files outside `docs/vygo/`

| Path | Role | Scope note |
| --- | --- | --- |
| `apps/web/public/docs/vygo/privacy-policy.md` | Published static mirror of Privacy Policy | Included because it is the public copy of the pack. |
| `apps/web/public/docs/vygo/terms-of-use.md` | Published static mirror of Terms of Use / Acceptable Use | Included because it is the public copy of the pack. |
| `apps/web/public/docs/vygo/LEGAL-PACK-AUDIT.md` | Published static mirror of this supporting audit | Delivery copy, not an operative policy. |
| `apps/web/src/content/legal.ts` | Deployed Privacy Notice and Website Terms source | Included because it contains separate customer-facing legal text and legal-review metadata. |
| `docs/content-operations.md` | Supporting legal publication procedure | Included because its “Legal pages” section identifies the deployed policies as draft and controls publication. |
| `docs/credentials-and-decisions.md` | Supporting legal/compliance decision register | Included because it records legal-review, privacy/terms, retention, and counsel dependencies. |

## Per-file issues

### `docs/vygo/privacy-policy.md` — Privacy Policy

- **Draft/placeholder language:** The opening is explicitly marked draft. Thirteen `[To be confirmed: ...]` prompts leave collection, sources, legal bases, cookies/analytics, AI processing, disclosures, retention, security, transfers, rights, children, updates, address, and DPO details unresolved.
- **Wrong or mixed entity names:** No different company is named, but the controller/operator is never named at all. “We” has no defined legal entity; the document does not connect the Vygo brand or `vygo.ai` to an accountable company.
- **Michigan / LLC framing:** No Michigan organization, Michigan limited liability company, or LLC status is stated.
- **TODOs and bracketed placeholders:** No literal `TODO` token appears. The draft marker and all thirteen “To be confirmed” items are bracketed placeholders.
- **Watermarks:** No watermark found beyond the conspicuous draft banner.
- **Internal inconsistencies / cross-document conflicts:** It says the Privacy Policy is separate from the Terms of Use but supplies no link or path. It omits an effective/last-updated date while promising an update process. Its rights and retention terms remain wholly unconfirmed, while `apps/web/src/content/legal.ts` affirmatively describes access/deletion requests, retention criteria, international processing, and a planning effective date. Provider-specific claims here (Resend, Cloudflare, Vercel, Railway) are replaced by generic provider categories in the deployed notice. Confirm which text is authoritative and align factual claims before approval.
- **Checklist:** Identify the legal controller and address; confirm Michigan/LLC framing; validate actual data fields, vendors, cookies/tokens, analytics, AI use, hosting locations, legal bases, retention schedule, privacy-right workflow, minors rule, transfer mechanism, update notice, and whether a DPO is applicable; add an effective date and a working Terms cross-reference.

### `docs/vygo/terms-of-use.md` — Terms of Use / embedded Acceptable Use

- **Draft/placeholder language:** The opening calls the entire document a draft placeholder requiring counsel approval. The limitation-of-liability clause expressly requires finalization.
- **Wrong or mixed entity names:** `[Company Legal Name]` is unresolved. “Vygo,” `vygo.ai`, and all-caps `VYGO` are used as brand/defined-term variants without identifying the contracting legal entity; no unrelated company name was found.
- **Michigan / LLC framing:** The document contains no Michigan or LLC framing. Governing law and forum are placeholders rather than Michigan selections.
- **TODOs and bracketed placeholders:** No literal `TODO` token appears. Bracketed placeholders are `[Company Legal Name]`, `[Age]`, `[Limitation of Liability language requires finalization by counsel]`, `[Governing Law Jurisdiction]`, `[Jurisdiction]`, and `[Company Address]`.
- **Watermarks:** No watermark found beyond the draft disclaimer.
- **Internal inconsistencies / cross-document conflicts:** The Terms do not link to the separate Privacy Policy. They promise an “updated effective date” but show no effective/last-updated date. The account-confidentiality language may imply accounts even though both privacy documents describe only a waitlist/application flow; confirm actual product behavior. The deployed terms in `apps/web/src/content/legal.ts` are a materially shorter alternate document: they omit eligibility/age, user-content license, service changes, termination, indemnity, governing law/forum, changes, company/address, and several warranty/liability details, while carrying a planning effective date not shown here.
- **Checklist:** Supply the exact Michigan LLC legal name and address; decide age threshold, Michigan governing law, venue, limitation terms, and whether account language applies; confirm the user-content license and termination/indemnity provisions; add an effective date and Privacy link; reconcile the Markdown and deployed versions.

### `apps/web/public/docs/vygo/privacy-policy.md` — published Privacy Policy mirror

- **Draft/placeholders, entity, Michigan/LLC, TODOs, brackets, and watermark:** Same unresolved issues as `docs/vygo/privacy-policy.md`; no literal `TODO` and no watermark beyond the draft banner.
- **Internal consistency:** Substantive text currently matches the source policy, but Markdown blank-line formatting differs in four list introductions. There is no documented generation/synchronization mechanism, so this manually maintained public copy can drift. Its existence alongside a different `/privacy` page sourced from `legal.ts` makes the public authority ambiguous.
- **Checklist:** Resolve the source-policy checklist above, designate the canonical public policy, and automate or verify mirror synchronization.

### `apps/web/public/docs/vygo/terms-of-use.md` — published Terms / Acceptable Use mirror

- **Draft/placeholders, entity, Michigan/LLC, TODOs, brackets, and watermark:** Same unresolved issues as `docs/vygo/terms-of-use.md`; no literal `TODO` and no watermark beyond the draft disclaimer.
- **Internal consistency:** Substantive text currently matches the source Terms, but blank lines after headings differ throughout. There is no documented generation/synchronization mechanism. A different `/terms` document is deployed from `legal.ts`, leaving two public versions with materially different coverage.
- **Checklist:** Resolve the source-Terms checklist above, designate the canonical public Terms, and automate or verify mirror synchronization.

### `apps/web/src/content/legal.ts` — deployed Privacy Notice and Website Terms

- **Draft/placeholder language:** File comments, `reviewMarker`, `reviewLabel`, and visible disclaimer mark both pages as draft. Retention, international transfers, effective-date status, and limitation language explicitly await counsel/finalization.
- **Wrong or mixed entity names:** Uses lowercase `vygo` without defining a legal operator/contracting entity. This conflicts in style with the capitalized “Vygo” defined term in the Markdown Terms; no unrelated entity is named.
- **Michigan / LLC framing:** No Michigan or LLC identity, governing law, forum, or company address appears.
- **TODOs and bracketed placeholders:** No literal `TODO` or square-bracket placeholder appears, but prose placeholders remain (for example “will be finalized with counsel”).
- **Watermarks:** No visual watermark text is in this source; the explicit draft label/disclaimer acts as the deployed draft marker.
- **Internal inconsistencies / cross-document conflicts:** `effectiveDate` is `2026-07-01`, described as effective “for planning purposes only,” while the Markdown policies have no date. The privacy notice grants an access/deletion contact process and states retention/transfer concepts that the Markdown Privacy Policy leaves unconfirmed. The terms are materially less complete than `docs/vygo/terms-of-use.md`, as itemized above. Both page bodies are maintained independently from the Markdown/public mirrors.
- **Checklist:** Decide which version is authoritative, then reconcile all factual and legal coverage; identify the Michigan LLC; replace planning/draft status only after counsel approval; ensure one consistent date, contact, entity, rights process, governing-law position, and public URL set.

### `docs/content-operations.md` — supporting publication procedure

- **Draft/placeholder language:** Correctly records that privacy and terms are drafts and that legal review is unresolved; this is a control note, not policy language.
- **Entity / Michigan / LLC:** Does not establish the legal entity or Michigan/LLC framing and does not point maintainers to a decision for them.
- **TODOs, brackets, watermarks:** No relevant literal TODO, bracketed legal placeholder, or watermark found in the reviewed legal-page guidance.
- **Internal consistency:** Refers generically to `privacy` and `terms` “source files” and `legal.ts`, but does not mention the Markdown pack or public mirrors. The procedure therefore does not define a canonical source or synchronization check.
- **Checklist:** In the rewrite pass, document the canonical policy sources, mirror/build process, counsel approval record, and required consistency verification across `/privacy`, `/terms`, and `/docs/vygo/*`.

### `docs/credentials-and-decisions.md` — supporting legal decision register

- **Draft/placeholder language:** Records privacy/terms and overall legal review as unresolved; separately assigns PII retention versus deletion to owner and counsel.
- **Entity / Michigan / LLC:** The decision table does not include selection/verification of the legal company name, Michigan formation, LLC status, address, governing law, or forum.
- **TODOs, brackets, watermarks:** No relevant literal TODO, bracketed legal placeholder, or watermark found in the reviewed decision entries.
- **Internal consistency:** Correctly says not to remove disclaimers without counsel sign-off, but provides no sign-off record location and no canonical-source/synchronization decision. Its unresolved retention decision corresponds to the Privacy Policy placeholder and the more affirmative deployed notice.
- **Checklist:** Add owner/counsel decisions for entity identity, Michigan LLC status, address, law/forum, policy authority, effective date, retention/deletion, privacy-right workflow, and approval evidence during the next pass.

### Audit delivery copies

- `docs/vygo/LEGAL-PACK-AUDIT.md` and `apps/web/public/docs/vygo/LEGAL-PACK-AUDIT.md` are checklist artifacts, not policies. They intentionally contain issue quotations/labels but no replacement legal clauses. The public copy must remain identical to this repository source copy.

## Cross-pack completeness and consistency checklist

- **Entity/contact:** All operative documents use `hello@vygo.ai`, so no conflicting email was found. None identifies the responsible/contracting legal entity or physical address. Confirm one exact Michigan LLC identity everywhere.
- **Governing law/forum:** Only the Markdown Terms addresses these topics, and both values are unresolved placeholders. No competing jurisdiction was found; Michigan is absent throughout.
- **Effective dates:** The deployed `legal.ts` copy uses `2026-07-01` for planning only; all four Markdown policy copies omit an effective date. Resolve this conflict.
- **Canonical text/public routes:** `/privacy` and `/terms` derive from `legal.ts`; `/docs/vygo/privacy-policy.md` and `/docs/vygo/terms-of-use.md` are separate public Markdown files. Designate canonical policies and prevent drift.
- **Missing standalone documents:** No standalone Cookie Policy, Acceptable Use Policy, or DPA was found. Decide with counsel whether embedded cookie/acceptable-use sections are sufficient and whether a DPA or other policies are needed for the actual service model.
- **Approval state:** Every customer-facing version is explicitly draft or contains unresolved counsel language. Do not remove draft markers or present any version as final until the owner records counsel approval.

## Completeness and scoping statement

Every file present under `docs/vygo/` at audit completion was reviewed and listed above; nothing under that directory was left unscoped. The audit itself is listed for inventory completeness but is not treated as an operative legal document.

Included out-of-folder files are the two public policy mirrors, their audit delivery copy, the deployed legal-content source, the legal publication procedure, and the legal decision register listed above. They were included because they either publish alternate Vygo policy text or directly control/record the policies’ draft and approval state.

The remaining files under `docs/` were deliberately excluded from per-file legal-pack review: `backups.md` and `incident-response.md` are internal operational runbooks; `owner-launch-checklist.md` only points maintainers to the already-included legal status records; and the API, deployment, architecture, readiness, email, Turnstile, verification, and other operations documents describe technical systems rather than customer-facing legal terms. Their isolated mentions of privacy, retention, deletion, counsel, or the Vygo project do not make them policy templates or cross-linked members of this legal pack. Marketing page components that merely render `legal.ts` were likewise excluded because they contain no independent policy text.

No source policy was changed as part of this audit.
