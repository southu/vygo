/**
 * Hardening + instrumentation acceptance checks (CI-runnable).
 * Covers: session create→save→resume (in-memory), secret block+redact,
 * golden/sloppy fixtures, every bucket rule, no-remediation snapshot copy,
 * and required analytics event name presence.
 *
 * Run: pnpm exec tsx --test packages/validation/src/hardening-instrumentation.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURE_CLEAN,
  FIXTURE_SLOPPY,
  buildPlantedSecretPaste,
  computeReadinessScore,
  containsRemediationDetail,
  assignEngagementBucket,
  type BucketSignals,
  PASTE_SECRETS_BLOCK_MESSAGE,
  redactPasteSecrets,
  runDeterministicParse,
  scanPasteForSecrets,
  type ReadinessReportV1Partial,
} from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

/** Required analytics event names (must match apps/web/src/lib/analytics.ts). */
const REQUIRED_ANALYTICS_EVENTS = [
  "stage_started",
  "stage_completed",
  "prompt_copied",
  "prompt_emailed",
  "fallback_taken",
  "paste_attempted",
  "secret_scan_blocked",
  "parse_success",
  "parse_normalized",
  "parse_failed",
  "session_resumed",
  "gate_completed",
  "bucket_assigned",
  "cta_clicked",
  "off_ramp_hit",
] as const;

const REMEDIATION_PHRASES = ["how to fix", "remediation", "to fix this"] as const;

function baseSignals(overrides: Partial<BucketSignals> = {}): BucketSignals {
  return {
    whoUses: "",
    internalOnly: false,
    externalUsers: false,
    payingUsers: false,
    enterpriseCustomers: false,
    multiTenantOrEnterprise: false,
    ssoOrCompliancePressure: false,
    securityQuestionnaire: false,
    weakReliability: false,
    weakCompliance: false,
    solidTool: false,
    foundationalGaps: false,
    notAFit: false,
    stage1Blockers: [],
    ...overrides,
  };
}

/** Minimal in-memory session store for create → save → resume-by-token. */
function createMemorySessionStore() {
  const sessions = new Map<
    string,
    { token: string; stage: string; draft: Record<string, unknown> }
  >();
  let n = 0;
  return {
    create(input: { stage?: string; draft?: Record<string, unknown> } = {}) {
      n += 1;
      const token = `tok_${n.toString(36).padStart(24, "0")}`;
      const draft = { ...(input.draft ?? {}) };
      // Mirror server: redact paste fields before store.
      if (typeof draft.pasteText === "string") {
        draft.pasteText = redactPasteSecrets(draft.pasteText).redacted;
      }
      const row = {
        token,
        stage: input.stage ?? "intake",
        draft,
      };
      sessions.set(token, row);
      return { ...row, draft: { ...row.draft } };
    },
    save(token: string, input: { stage?: string; draft?: Record<string, unknown> }) {
      const existing = sessions.get(token);
      if (!existing) return null;
      const draft = input.draft !== undefined ? { ...input.draft } : { ...existing.draft };
      if (typeof draft.pasteText === "string") {
        draft.pasteText = redactPasteSecrets(draft.pasteText).redacted;
      }
      const row = {
        token,
        stage: input.stage ?? existing.stage,
        draft,
      };
      sessions.set(token, row);
      return { ...row, draft: { ...row.draft } };
    },
    resume(token: string) {
      const row = sessions.get(token);
      if (!row) return null;
      return { token: row.token, stage: row.stage, draft: { ...row.draft } };
    },
  };
}

describe("session create → save → resume-by-token", () => {
  it("restores previously saved stage and draft answers by token", () => {
    const store = createMemorySessionStore();
    const created = store.create({ stage: "intake", draft: { stage1: { whoUses: "Just me" } } });
    assert.ok(created.token.length >= 16);

    const saved = store.save(created.token, {
      stage: "prompt",
      draft: {
        stage1: {
          productDescription: "Inventory tool",
          whoUses: "My internal team",
          builtWith: "Cursor",
        },
      },
    });
    assert.ok(saved);
    assert.equal(saved!.stage, "prompt");

    const resumed = store.resume(created.token);
    assert.ok(resumed);
    assert.equal(resumed!.token, created.token);
    assert.equal(resumed!.stage, "prompt");
    const stage1 = resumed!.draft.stage1 as Record<string, string>;
    assert.equal(stage1.productDescription, "Inventory tool");
    assert.equal(stage1.whoUses, "My internal team");
    assert.equal(stage1.builtWith, "Cursor");
  });
});

describe("planted secret: client block + server redact", () => {
  it("blocks credential-shaped paste client-side and stores [REDACTED] only", () => {
    const { paste, plantedToken } = buildPlantedSecretPaste(FIXTURE_CLEAN);
    assert.ok(paste.includes(plantedToken));

    // (b) client-side block
    const scan = scanPasteForSecrets(paste);
    assert.equal(scan.clean, false);
    assert.ok(scan.hits.length >= 1);
    assert.equal(PASTE_SECRETS_BLOCK_MESSAGE, "Remove secrets before submitting.");

    // server-side redaction
    const redaction = redactPasteSecrets(paste);
    assert.equal(redaction.didRedact, true);
    assert.ok(redaction.redacted.includes("[REDACTED]"));
    assert.ok(!redaction.redacted.includes(plantedToken));

    // stored value path (session draft)
    const store = createMemorySessionStore();
    const created = store.create({ stage: "paste" });
    const saved = store.save(created.token, {
      stage: "paste",
      draft: { pasteText: paste },
    });
    assert.ok(saved);
    const stored = String(saved!.draft.pasteText ?? "");
    assert.ok(stored.includes("[REDACTED]"));
    assert.ok(!stored.includes(plantedToken));

    const resumed = store.resume(created.token);
    assert.ok(resumed);
    const retrieved = String(resumed!.draft.pasteText ?? "");
    assert.ok(retrieved.includes("[REDACTED]"));
    assert.ok(!retrieved.includes(plantedToken));
  });

  it("blocks AKIA-style planted keys client-side", () => {
    const akia = "AKIA" + "0" + "EXAMPLEKEY12345";
    const paste = `note\naws_key=${akia}\n`;
    const scan = scanPasteForSecrets(paste);
    assert.equal(scan.clean, false);
    const redacted = redactPasteSecrets(paste);
    assert.ok(redacted.redacted.includes("[REDACTED]"));
    assert.ok(!redacted.redacted.includes(akia));
  });
});

describe("golden fixtures including sloppy", () => {
  it("clean fixture parses to schema-valid report", () => {
    const result = runDeterministicParse(FIXTURE_CLEAN);
    assert.equal(result.parseStatus, "ok");
    assert.ok(result.fullReport || result.report);
  });

  it("sloppy fixture recovers or routes to manual without throwing", () => {
    const result = runDeterministicParse(FIXTURE_SLOPPY);
    assert.ok(
      result.parseStatus === "ok" ||
        result.parseStatus === "partial" ||
        result.parseStatus === "manual" ||
        result.parseStatus === "pending",
    );
    assert.ok(result.route === "confirm" || result.route === "manual");
  });
});

describe("bucket assignment fixtures for every rule", () => {
  it("not_a_fit", () => {
    const r = assignEngagementBucket(baseSignals({ notAFit: true }));
    assert.equal(r.bucket, "Not a fit");
    assert.equal(r.matchedRule, "not_a_fit");
  });

  it("enterprise_pressure", () => {
    const r = assignEngagementBucket(
      baseSignals({
        multiTenantOrEnterprise: true,
        ssoOrCompliancePressure: true,
      }),
    );
    assert.equal(r.bucket, "Enterprise");
    assert.equal(r.matchedRule, "enterprise_pressure");
  });

  it("scale_security_questionnaire", () => {
    const r = assignEngagementBucket(
      baseSignals({
        securityQuestionnaire: true,
        payingUsers: true,
        weakReliability: true,
      }),
    );
    assert.equal(r.bucket, "Scale");
    assert.equal(r.matchedRule, "scale_security_questionnaire");
  });

  it("launch_external_gaps", () => {
    const r = assignEngagementBucket(
      baseSignals({
        externalUsers: true,
        foundationalGaps: true,
      }),
    );
    assert.equal(r.bucket, "Launch");
    assert.equal(r.matchedRule, "launch_external_gaps");
  });

  it("harden_internal_solid", () => {
    const r = assignEngagementBucket(
      baseSignals({
        internalOnly: true,
        solidTool: true,
        externalUsers: false,
      }),
    );
    assert.equal(r.bucket, "Harden");
    assert.equal(r.matchedRule, "harden_internal_solid");
  });

  it("harden_internal_default", () => {
    const r = assignEngagementBucket(
      baseSignals({
        internalOnly: true,
        externalUsers: false,
        multiTenantOrEnterprise: false,
        ssoOrCompliancePressure: false,
        solidTool: false,
        weakReliability: false,
        weakCompliance: true,
      }),
    );
    assert.equal(r.bucket, "Harden");
    assert.equal(r.matchedRule, "harden_internal_default");
  });

  it("unresolved → Launch default (default_launch)", () => {
    // No rule matches → Launch with talk-to-us caveat
    const r = assignEngagementBucket(baseSignals({}));
    assert.equal(r.bucket, "Launch");
    assert.equal(r.matchedRule, "default_launch");
    assert.ok(r.caveat && /talk to us/i.test(r.caveat));
  });
});

describe("no-remediation snapshot copy guard", () => {
  it("snapshot-like score payload has no how-to-fix / remediation language", () => {
    const report: ReadinessReportV1Partial = {
      summary: "Internal ops tool",
      languages: "TypeScript",
      size: "small",
      structure: "monorepo",
      frontend: "Next.js",
      backend: "Fastify",
      database: "Postgres",
      tenancy: "single-tenant internal",
      auth: "session cookies",
      authorization: "RBAC",
      row_level_security: "app middleware",
      environments: "staging production",
      deploys: "GitHub Actions automated",
      tests: "unit integration on every deploy",
      background_jobs: "worker",
      integrations: "Slack",
      secrets_pattern: "env + vault",
      logging: "structured",
      error_handling: "safe errors",
      pii_categories: "email name",
      api_surface: "HTTPS /v1",
      fragility_flags: ["single_region"],
      confidence: 0.8,
    };
    const payload = computeReadinessScore({
      report,
      source: "paste",
      stage1: {
        whoUses: "My internal team",
        productDescription: "Ops tool",
        builtWith: "Cursor",
        blockers: ["nothing broken — want solid before launch"],
        deadline: "No hard deadline",
        deadlineDetail: "",
      },
    });

    const snapshotText = [
      payload.bucket,
      payload.reasoning,
      payload.caveat ?? "",
      payload.ctaLabel,
      payload.recommendedEngagement,
      ...payload.findings,
      JSON.stringify(payload.pricing),
    ]
      .join("\n")
      .toLowerCase();

    for (const phrase of REMEDIATION_PHRASES) {
      assert.ok(!snapshotText.includes(phrase), `snapshot output must not contain "${phrase}"`);
    }
    for (const f of payload.findings) {
      assert.equal(containsRemediationDetail(f), false);
    }
  });
});

describe("analytics event presence", () => {
  it("analytics module and readiness flow declare all required event names", () => {
    const analyticsSrc = readFileSync(join(REPO_ROOT, "apps/web/src/lib/analytics.ts"), "utf8");
    const flowSrc = readFileSync(
      join(REPO_ROOT, "apps/web/src/components/readiness/ReadinessFlow.tsx"),
      "utf8",
    );
    const snapshotSrc = readFileSync(
      join(REPO_ROOT, "apps/web/src/components/readiness/SnapshotView.tsx"),
      "utf8",
    );
    const gateSrc = readFileSync(
      join(REPO_ROOT, "apps/web/src/components/readiness/ScoreGateForm.tsx"),
      "utf8",
    );
    const combined = `${analyticsSrc}\n${flowSrc}\n${snapshotSrc}\n${gateSrc}`;

    for (const name of REQUIRED_ANALYTICS_EVENTS) {
      assert.ok(analyticsSrc.includes(`"${name}"`), `analytics.ts must declare event "${name}"`);
      assert.ok(combined.includes(name), `client readiness sources must reference event "${name}"`);
    }
  });
});
