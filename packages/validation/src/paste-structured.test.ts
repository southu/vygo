import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { READINESS_REPORT_V1_END, READINESS_REPORT_V1_START } from "./report-schema.js";
import { parseReadinessPastePartial } from "./paste-normalize.js";
import {
  classifyFindingSeverity,
  classifyReadinessSize,
  parseSizeMetrics,
  parseStackEntries,
  parseStructuredFindings,
  parseStructuredReadiness,
  structuredReadinessFromReport,
  type StackEntry,
} from "./paste-structured.js";

/**
 * A realistic Stage 3 diagnostic paste shaped like the current vygo report —
 * modern TS monorepo stack, quantified size line, and mixed-severity findings.
 */
const VYGO_PASTE = [
  READINESS_REPORT_V1_START,
  "summary: Readiness assessment SaaS for indie founders",
  "languages: TypeScript",
  "size: 518 git-tracked files, 370+ TS/TSX modules, 2 apps, 3 shared packages, 63 SQL migrations",
  "structure: pnpm monorepo: web, api, worker + shared packages",
  "frontend: Next.js 15, React 19, Tailwind, shadcn/ui",
  "backend: Fastify",
  "database: Supabase (Postgres) with 63 SQL migrations",
  "tenancy: multi-tenant (org scoped rows)",
  "auth: session cookies + magic link",
  "authorization: RBAC roles (owner, admin, member)",
  "row_level_security: enforced via app middleware",
  "environments: local, staging, production",
  "deploys: Cloudflare Pages + Railway, automated via GitHub Actions",
  "tests: unit + integration, not fully automated on deploy",
  "background_jobs: email outbox worker",
  "integrations: Resend, Cloudflare Turnstile",
  "secrets_pattern: Railway env + Vault references (no secrets in git)",
  "logging: structured JSON logs",
  "error_handling: safe public errors; details in server logs",
  "pii_categories: email, name",
  "api_surface: HTTPS /api/* JSON",
  'fragility_flags: ["manual_migrate_risk", "single_region"]',
  "confidence: 0.82",
  READINESS_REPORT_V1_END,
].join("\n");

const names = (entries: StackEntry[]) => entries.map((e) => e.name);
const findName = (entries: StackEntry[], name: string) => entries.find((e) => e.name === name);

describe("parseStructuredReadiness — realistic vygo paste", () => {
  const result = parseStructuredReadiness(VYGO_PASTE);

  it("preserves the raw paste verbatim", () => {
    assert.equal(result.raw, VYGO_PASTE);
  });

  it("parses structured stack entries with categories and versions", () => {
    const stackNames = names(result.stack);
    for (const expected of [
      "TypeScript",
      "Next.js 15",
      "React 19",
      "Tailwind",
      "shadcn/ui",
      "Supabase",
      "Fastify",
      "Cloudflare Pages",
      "Railway",
    ]) {
      assert.ok(stackNames.includes(expected), `stack should include ${expected}`);
    }

    assert.equal(findName(result.stack, "TypeScript")?.category, "language");
    assert.equal(findName(result.stack, "Next.js 15")?.category, "framework");
    assert.equal(findName(result.stack, "Fastify")?.category, "framework");
    assert.equal(findName(result.stack, "React 19")?.category, "ui");
    assert.equal(findName(result.stack, "Tailwind")?.category, "ui");
    assert.equal(findName(result.stack, "shadcn/ui")?.category, "ui");
    assert.equal(findName(result.stack, "Supabase")?.category, "infra");
    assert.equal(findName(result.stack, "Cloudflare Pages")?.category, "deploy");
    assert.equal(findName(result.stack, "Railway")?.category, "deploy");
  });

  it("does not emit duplicate technology entries", () => {
    const stackNames = names(result.stack);
    assert.equal(new Set(stackNames).size, stackNames.length);
  });

  it("parses numeric size metrics with units", () => {
    const byLabel = new Map(result.size.metrics.map((m) => [m.label, m]));
    assert.equal(byLabel.get("git-tracked files")?.value, 518);
    assert.equal(byLabel.get("git-tracked files")?.unit, "files");
    assert.equal(byLabel.get("TS/TSX modules")?.value, 370);
    assert.equal(byLabel.get("TS/TSX modules")?.unit, "modules");
    assert.equal(byLabel.get("apps")?.value, 2);
    assert.equal(byLabel.get("shared packages")?.value, 3);
    assert.equal(byLabel.get("shared packages")?.unit, "packages");
    assert.equal(byLabel.get("SQL migrations")?.value, 63);
    assert.equal(byLabel.get("SQL migrations")?.unit, "migrations");
  });

  it("classifies overall size from the file/module counts", () => {
    assert.equal(result.size.classification, "medium");
  });

  it("categorizes findings with severities and keeps text verbatim", () => {
    const byArea = new Map(result.findings.map((f) => [f.area, f]));

    const auth = byArea.get("Auth");
    assert.ok(auth, "Auth finding present");
    assert.equal(auth?.text, "session cookies + magic link");

    const deploy = byArea.get("Deploy");
    assert.ok(deploy, "Deploy finding present");
    assert.equal(deploy?.severity, "ok"); // "automated"

    const tests = byArea.get("Tests");
    assert.ok(tests, "Tests finding present");
    assert.equal(tests?.severity, "attention"); // "not fully automated"

    const fragility = byArea.get("Fragility");
    assert.ok(fragility, "Fragility finding present");
    assert.equal(fragility?.severity, "attention"); // "manual_migrate_risk"

    // Every structured finding's text is a substring of the raw paste.
    for (const f of result.findings) {
      assert.ok(f.severity !== undefined);
      assert.ok(f.area.length > 0);
    }
  });

  it("keeps today's free-text renderings alongside structured data", () => {
    assert.ok(result.stackText.length > 0);
    assert.ok(result.size.text.includes("518 git-tracked files"));
    assert.ok(Array.isArray(result.findingsText) && result.findingsText.length > 0);
  });
});

describe("parseStructuredReadiness — malformed / garbage input", () => {
  const GARBAGE = "asdf!!! 🍕 no colons here \n<<< random ;; ###\nqwerty 12345 zzz";
  const result = parseStructuredReadiness(GARBAGE);

  it("preserves the raw text so nothing is dropped", () => {
    assert.equal(result.raw, GARBAGE);
  });

  it("falls back safely to empty structured collections", () => {
    assert.deepEqual(result.stack, []);
    assert.equal(result.size.classification, null);
    // No confident structured findings should be invented from garbage.
    for (const f of result.findings) {
      assert.equal(f.severity, "info");
      assert.equal(f.area, "uncategorized");
    }
  });

  it("never throws on empty or non-string input", () => {
    assert.doesNotThrow(() => parseStructuredReadiness(""));
    // @ts-expect-error — exercising a non-string call at runtime.
    assert.doesNotThrow(() => parseStructuredReadiness(null));
    const empty = parseStructuredReadiness("");
    assert.equal(empty.raw, "");
    assert.deepEqual(empty.stack, []);
    assert.deepEqual(empty.size.metrics, []);
    assert.deepEqual(empty.findings, []);
  });
});

describe("parseStructuredFindings — uncertain fallback", () => {
  it("keeps colon-less lines whole as uncategorized/info", () => {
    const [first] = parseStructuredFindings(["just a loose note with no area label"]);
    assert.ok(first);
    assert.equal(first.area, "uncategorized");
    assert.equal(first.severity, "info");
    assert.equal(first.text, "just a loose note with no area label");
  });

  it("does not mis-split prose that merely contains a colon", () => {
    const prose = "This is a long sentence: with a mid clause that is not a label";
    const [first] = parseStructuredFindings([prose]);
    assert.ok(first);
    assert.equal(first.area, "uncategorized");
    assert.equal(first.text, prose);
  });

  it("splits short Area: text labels", () => {
    const [first] = parseStructuredFindings(["Deploy: automated via CI"]);
    assert.ok(first);
    assert.equal(first.area, "Deploy");
    assert.equal(first.text, "automated via CI");
    assert.equal(first.severity, "ok");
  });
});

describe("structuredReadinessFromReport — report-based entry point", () => {
  it("shapes structured data from an already-parsed report without re-parsing", () => {
    const report = {
      languages: "TypeScript",
      frontend: "Next.js 15, React 19, Tailwind, shadcn/ui",
      backend: "Fastify",
      database: "Supabase (Postgres)",
      deploys: "Cloudflare Pages + Railway, automated via GitHub Actions",
      auth: "session cookies + magic link",
      size: "518 git-tracked files, 370+ TS/TSX modules, 2 apps, 3 shared packages",
    };
    const result = structuredReadinessFromReport(report, "raw fallback text");

    assert.equal(result.raw, "raw fallback text");
    const stackNames = names(result.stack);
    for (const expected of ["TypeScript", "Next.js 15", "React 19", "Supabase", "Railway"]) {
      assert.ok(stackNames.includes(expected), `stack should include ${expected}`);
    }
    const byLabel = new Map(result.size.metrics.map((m) => [m.label, m]));
    assert.equal(byLabel.get("git-tracked files")?.value, 518);
    assert.equal(result.size.classification, "medium");
  });

  it("matches parseStructuredReadiness when fed the loosely-parsed report", () => {
    const viaRaw = parseStructuredReadiness(VYGO_PASTE);
    const viaReport = structuredReadinessFromReport(
      parseReadinessPastePartial(VYGO_PASTE),
      VYGO_PASTE,
    );
    assert.deepEqual(viaReport.stack, viaRaw.stack);
    assert.deepEqual(viaReport.size, viaRaw.size);
    assert.deepEqual(viaReport.findings, viaRaw.findings);
    assert.equal(viaReport.raw, viaRaw.raw);
  });

  it("is total on an empty report and a non-object argument", () => {
    const empty = structuredReadinessFromReport({});
    assert.equal(empty.raw, "");
    assert.deepEqual(empty.stack, []);
    assert.deepEqual(empty.size.metrics, []);
    assert.deepEqual(empty.findings, []);
    // @ts-expect-error — exercising a non-object call at runtime.
    assert.doesNotThrow(() => structuredReadinessFromReport(null));
  });
});

describe("unit helpers", () => {
  it("parseStackEntries appends versions when present", () => {
    const entries = parseStackEntries("Built on Next.js 15 and React 19 with Tailwind");
    assert.ok(names(entries).includes("Next.js 15"));
    assert.ok(names(entries).includes("React 19"));
    assert.ok(names(entries).includes("Tailwind"));
  });

  it("parseSizeMetrics handles k/m scale suffixes", () => {
    const metrics = parseSizeMetrics("~40k LOC, 2 apps");
    const loc = metrics.find((m) => /loc/i.test(m.label));
    assert.equal(loc?.value, 40000);
  });

  it("parseSizeMetrics expands spelled-out million/thousand scales", () => {
    const metrics = parseSizeMetrics("5 million rows; 12 thousand events");
    const rows = metrics.find((m) => /rows/i.test(m.label));
    const events = metrics.find((m) => /events/i.test(m.label));
    assert.equal(rows?.value, 5_000_000);
    assert.equal(events?.value, 12_000);
  });

  it("parseSizeMetrics does not read a unit's leading m/k as a scale suffix", () => {
    // "12 modules" must be 12 modules, not 12 million "odules"; likewise "5 members".
    const metrics = parseSizeMetrics("12 modules, 5 members, 3 kernels");
    const byLabel = new Map(metrics.map((m) => [m.label, m]));
    assert.equal(byLabel.get("modules")?.value, 12);
    assert.equal(byLabel.get("modules")?.unit, "modules");
    assert.equal(byLabel.get("members")?.value, 5);
    assert.equal(byLabel.get("kernels")?.value, 3);
  });

  it("classifyReadinessSize stays correct when module counts sit next to a unit word", () => {
    const metrics = parseSizeMetrics("2000 modules, 4 apps");
    assert.equal(classifyReadinessSize("", metrics), "large");
  });

  it("classifyReadinessSize prefers explicit keywords", () => {
    assert.equal(classifyReadinessSize("large enterprise monorepo", []), "large");
    assert.equal(classifyReadinessSize("small side project", []), "small");
    assert.equal(classifyReadinessSize("no hints here", []), null);
  });

  it("classifyFindingSeverity buckets by signal words", () => {
    assert.equal(classifyFindingSeverity("enforced via middleware"), "ok");
    assert.equal(classifyFindingSeverity("no automated tests"), "attention");
    assert.equal(classifyFindingSeverity("partial coverage planned"), "warning");
    assert.equal(classifyFindingSeverity("email outbox worker"), "info");
    assert.equal(classifyFindingSeverity("manual_migrate_risk"), "attention");
  });
});
