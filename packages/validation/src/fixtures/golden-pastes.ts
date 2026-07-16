/**
 * Golden readiness paste fixtures for Stage 3 parser tests and live API proof.
 * Clean baseline values must match across clean / chat-wrapped / fenced variants.
 * Secret-shaped tokens are assembled at runtime so repo secret-scan stays clean.
 */
import {
  READINESS_REPORT_V1_END,
  READINESS_REPORT_V1_START,
  type ReadinessReportV1,
} from "../report-schema.js";

/** Canonical field values shared by clean / chat-wrapped / fenced fixtures. */
export const GOLDEN_CLEAN_FIELDS: ReadinessReportV1 = {
  summary: "Scheduling SaaS for multi-location clinics",
  languages: "TypeScript, Python",
  size: "medium (~40k LOC monorepo)",
  structure: "pnpm monorepo: web, api, worker, packages",
  frontend: "Next.js App Router",
  backend: "Fastify on Railway",
  database: "Postgres with Drizzle migrations",
  tenancy: "multi-tenant (org_id on rows)",
  auth: "session cookies + magic link",
  authorization: "RBAC roles (owner, admin, member)",
  row_level_security: "enforced via app middleware; RLS planned",
  environments: "local, staging, production",
  deploys: "GitHub Actions -> Vercel + Railway, automated",
  tests: "unit + integration on every deploy via CI",
  background_jobs: "email outbox worker",
  integrations: "Resend, Cloudflare Turnstile",
  secrets_pattern: "Railway env + Vault references (no secrets in git)",
  logging: "structured JSON logs, request ids",
  error_handling: "safe public errors; details only in server logs",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1/* JSON API",
  fragility_flags: ["manual_migrate_risk", "single_region"],
  confidence: 0.82,
};

function formatBlock(fields: ReadinessReportV1): string {
  const lines: string[] = [READINESS_REPORT_V1_START];
  for (const [key, value] of Object.entries(fields)) {
    if (key === "fragility_flags" && Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push(READINESS_REPORT_V1_END);
  return lines.join("\n");
}

/** Clean delimited report — full schema, no chatter. */
export const FIXTURE_CLEAN = formatBlock(GOLDEN_CLEAN_FIELDS);

/** Same report wrapped in chat assistant prose (common paste-back). */
export const FIXTURE_CHAT_WRAPPED = [
  "Sure — here is the readiness report based on the repo:",
  "",
  FIXTURE_CLEAN,
  "",
  "Let me know if you want me to expand any section.",
].join("\n");

/** Same report inside a markdown fenced code block. */
export const FIXTURE_FENCED = ["```text", FIXTURE_CLEAN, "```"].join("\n");

/**
 * Start delimiter present but footer missing; most fields still present.
 * Parser should recover fields (with footer ensure) or route to manual.
 */
export const FIXTURE_MISSING_FOOTER = FIXTURE_CLEAN.replace(`\n${READINESS_REPORT_V1_END}`, "");

/**
 * Sloppy / incomplete paste: partial keys, no delimiters, messy labels.
 * Must recover schema-valid JSON or explicitly route to manual questionnaire.
 */
export const FIXTURE_SLOPPY = [
  "readiness notes from standup",
  "summary - clinic scheduling tool roughly",
  "we use typescript mostly and some python scripts",
  "frontend is nextjs, backend node",
  "db: postgres",
  "auth stuff: clerk I think?",
  "deploys: someone clicks deploy on vercel",
  "tests: not really automated",
  "confidence low",
].join("\n");

/**
 * Build a paste that plants a credential-shaped token for redaction proof.
 * Token is assembled at runtime so tracked files never hold a full literal.
 */
export function buildPlantedSecretPaste(base: string = FIXTURE_CLEAN): {
  paste: string;
  plantedToken: string;
} {
  const plantedToken = ["sk", "test", "plantedredactproof99aabbccddeeff"].join("_");
  const paste = `${base}\n# ops note\napi_key = ${plantedToken}\n`;
  return { paste, plantedToken };
}

export const GOLDEN_FIXTURE_NAMES = [
  "clean",
  "chat_wrapped",
  "fenced",
  "missing_footer",
  "sloppy",
] as const;

export type GoldenFixtureName = (typeof GOLDEN_FIXTURE_NAMES)[number];

export function getGoldenFixture(name: GoldenFixtureName): string {
  switch (name) {
    case "clean":
      return FIXTURE_CLEAN;
    case "chat_wrapped":
      return FIXTURE_CHAT_WRAPPED;
    case "fenced":
      return FIXTURE_FENCED;
    case "missing_footer":
      return FIXTURE_MISSING_FOOTER;
    case "sloppy":
      return FIXTURE_SLOPPY;
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
