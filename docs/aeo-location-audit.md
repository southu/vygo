# Vygo AEO Location and Tool Audit

## 1. Tool-Mention Inventory

Every occurrence of AI tool mentions in templates, pages, or content:

- **Lovable**
  - apps/web/src/app/page.tsx:49
  - apps/web/src/content/faq.ts:15
  - apps/web/src/content/homepage.ts:18
  - apps/web/src/content/insights.ts:22
  - apps/web/src/content/insights.ts:23
  - apps/web/src/content/insights.ts:25
  - apps/web/src/content/insights.ts:28
  - apps/web/src/content/insights.ts:31
  - packages/validation/src/readiness-intake.ts:19
  - packages/validation/src/readiness-intake.ts:64

- **Cursor**
  - apps/web/src/app/page.tsx:49
  - apps/web/src/content/faq.ts:15
  - apps/web/src/content/homepage.ts:18
  - apps/web/src/content/guide-setup.tsx:55
  - packages/email/src/render.ts:207
  - packages/validation/src/readiness-intake.ts:20
  - packages/validation/src/readiness-intake.ts:56

- **Replit**
  - apps/web/src/app/page.tsx:49
  - apps/web/src/content/faq.ts:15
  - apps/web/src/content/homepage.ts:18
  - packages/validation/src/readiness-intake.ts:21
  - packages/validation/src/readiness-intake.ts:64

- **Bolt**
  - apps/web/src/app/page.tsx:49
  - apps/web/src/content/faq.ts:15
  - apps/web/src/content/homepage.ts:18
  - packages/validation/src/readiness-intake.ts:22
  - packages/validation/src/readiness-intake.ts:64

- **v0**
  - apps/web/src/app/page.tsx:49
  - apps/web/src/content/faq.ts:15
  - apps/web/src/content/homepage.ts:18
  - packages/validation/src/readiness-intake.ts:23
  - packages/validation/src/readiness-intake.ts:64

## 2. 'Built for' Pill Strip Rendering

The 'Built for' tool pill strip section is rendered in:

- **File**: apps/web/src/app/page.tsx:49
- **Code Block**:
  ```tsx
  <div className="mt-8 flex flex-wrap gap-2">
    {["Lovable", "Cursor", "Replit", "Bolt", "v0"].map((tool) => (
      <span key={tool} className="chip">
        {tool}
      </span>
    ))}
  </div>
  ```

## 3. Location-Phrasing Inventory

Occurrences of team location phrasing in templates, pages, content, and metadata:

- **'senior U.S.-based engineering'**
  - apps/web/src/content/homepage.ts:11
- **'Senior U.S.-based engineers · Fixed price after audit'**
  - apps/web/src/content/homepage.ts:14
- **Other Workforce Location phrasing**
  - apps/web/src/content/homepage.ts:230 (title: "U.S.-based engineering")
  - apps/web/src/content/homepage.ts:231 (body: "Engineering delivery is staffed from the United States.")
  - apps/web/src/content/homepage.ts:246 (feature flag gating)
  - apps/web/src/content/site.ts:15 (metadata description contains: "Senior U.S.-based production engineering")
  - packages/ui/src/index.ts:10 (contains: "vygo provides senior U.S.-based production engineering")
  - apps/web/src/content/flags.ts:9 (comment: "Publish “U.S.-based” language only while operationally true.")

## 4. Integration Status of Candidate Tools

Comparison of candidate tools against vygo's actual product/build tooling:

- **Claude / Claude Code**: Reflected in questionnaire options and setup documentation, but **not integrated — do not list** in actual product/build tooling.
- **Grok**: **not integrated — do not list** in actual product/build tooling.
- **Copilot**: **not integrated — do not list** in actual product/build tooling.
- **Windsurf**: Reflected in questionnaire options, but **not integrated — do not list** in actual product/build tooling.

## 5. Security & Tokens Check

No access tokens, API keys, credentials, or secret patterns (like 'sk-', 'Bearer ', or 'RAILWAY_TOKEN') are contained in this audit file.
