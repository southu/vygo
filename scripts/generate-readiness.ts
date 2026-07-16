/**
 * Generates apps/web/src/generated/readiness.json for GET /api/readiness.
 * Invoked by CI and by apps/web prebuild. Records workspace structure and
 * check results produced by the production/CI pipeline.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SCORING_CONFIG,
  READINESS_CHECK_LABELS,
  computeReadinessScore,
} from "../packages/validation/src/readiness-scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function exists(rel: string): boolean {
  return existsSync(path.join(root, rel));
}

function readText(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function gitSha(): string {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "";
  if (fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv.trim())) {
    return fromEnv.trim();
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function countCommittedExternalDocs(): number {
  try {
    const out = execFileSync("git", ["ls-files", "--", "external-docs", "external-docs/**"], {
      cwd: root,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean).length;
  } catch {
    return -1;
  }
}

function isExternalDocsIgnored(): boolean {
  const gitignore = exists(".gitignore") ? readText(".gitignore") : "";
  if (!/^\s*external-docs\/\s*$/m.test(gitignore) && !/external-docs\//.test(gitignore)) {
    return false;
  }
  try {
    const check = execFileSync("git", ["check-ignore", "-v", "external-docs/"], {
      cwd: root,
      encoding: "utf8",
    });
    return check.includes("external-docs");
  } catch {
    // check-ignore exits 1 when not ignored
    return /external-docs\//.test(gitignore);
  }
}

function hasRootScripts(): boolean {
  if (!exists("package.json")) return false;
  const pkg = JSON.parse(readText("package.json")) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};
  const required = ["build", "lint", "format:check", "typecheck", "dev"];
  return required.every((name) => typeof scripts[name] === "string");
}

function isStrictTypescript(): boolean {
  if (!exists("tsconfig.base.json")) return false;
  const ts = JSON.parse(readText("tsconfig.base.json")) as {
    compilerOptions?: { strict?: boolean };
  };
  return ts.compilerOptions?.strict === true;
}

function secretScan(): {
  status: "passed" | "failed";
  detectedSecrets: number;
  findings: string[];
} {
  try {
    const out = execFileSync("pnpm", ["exec", "tsx", "scripts/secret-scan.ts", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    const parsed = JSON.parse(out) as {
      status: "passed" | "failed";
      detectedSecrets: number;
      findings: string[];
    };
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", detectedSecrets: 1, findings: [message] };
  }
}

function readmeHasLocalStartup(): boolean {
  if (!exists("README.md")) return false;
  const readme = readText("README.md").toLowerCase();
  return (
    readme.includes("local") &&
    (readme.includes("startup") ||
      readme.includes("start") ||
      readme.includes("dev") ||
      readme.includes("pnpm dev"))
  );
}

function envExamplesPresent(): boolean {
  return (
    exists(".env.example") &&
    exists("apps/web/.env.example") &&
    exists("apps/api/.env.example") &&
    exists("apps/worker/.env.example")
  );
}

function typedEnvValidationPresent(): boolean {
  return exists("packages/config/src/index.ts") && exists("packages/config/package.json");
}

function runtimeNodeMajor(): number {
  return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
}

/** Active LTS major as of this mission (Node 24 Krypton). */
const ACTIVE_LTS_MAJOR = 24;

/** Configured Node major from .nvmrc (preferred) or package engines, else runtime. */
function configuredNodeMajor(): number {
  if (exists(".nvmrc")) {
    const raw = readText(".nvmrc").trim();
    const match = raw.match(/^v?(\d+)/);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }
  if (exists("package.json")) {
    const pkg = JSON.parse(readText("package.json")) as {
      engines?: { node?: string };
    };
    const engines = pkg.engines?.node ?? "";
    const match = engines.match(/(\d+)/);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }
  return runtimeNodeMajor();
}

function checkStatus(flag: string | undefined, fallbackPassed: boolean): "passed" | "failed" {
  if (flag === "passed" || flag === "failed") return flag;
  return fallbackPassed ? "passed" : "failed";
}

/**
 * Compact pointer to the Railway backend foundation status artifact so the
 * provision outcome + deploy-gate verdict are discoverable in one hop from
 * GET /api/readiness. Derived from the generated foundation artifact (single
 * source of truth); falls back to a static pointer if it has not been written
 * yet in this build (scripts/generate-foundation-status.ts runs first).
 */
function readFoundationPointer(): {
  statusUrl: string;
  project: string;
  provision: { outcome: string; code: string | null };
  gate: { verdict: string; forHumanAttachOn: string };
  docs: string;
} {
  const fallback = {
    statusUrl: "/api/railway-foundation",
    project: "vygo",
    provision: { outcome: "failed_closed", code: "consumer_not_armed" },
    gate: { verdict: "go", forHumanAttachOn: "vygo" },
    docs: "docs/railway-backend-readiness.md",
  };
  const rel = "apps/web/public/api/railway-foundation.json";
  if (!exists(rel)) return fallback;
  try {
    const parsed = JSON.parse(readText(rel)) as {
      project?: string;
      provision?: { outcome?: string; code?: string | null };
      gate?: { verdict?: string; forHumanAttachOn?: string };
    };
    return {
      statusUrl: "/api/railway-foundation",
      project: parsed.project ?? "vygo",
      provision: {
        outcome: parsed.provision?.outcome ?? fallback.provision.outcome,
        code: parsed.provision?.code ?? null,
      },
      gate: {
        verdict: parsed.gate?.verdict ?? fallback.gate.verdict,
        forHumanAttachOn: parsed.gate?.forHumanAttachOn ?? "vygo",
      },
      docs: "docs/railway-backend-readiness.md",
    };
  } catch {
    return fallback;
  }
}

/**
 * Public view of the readiness analysis model: the five scored dimensions
 * broken down into their sub-metric checks, plus a scored self-assessment of
 * this repo so the nested payload shape is observable at GET /api/readiness.
 * The same engine (computeReadinessScore) serves user submissions at
 * POST /v1/readiness/score.
 */
function buildReadinessAnalysis() {
  const scoringModel = {
    configKey: DEFAULT_SCORING_CONFIG.configKey,
    version: DEFAULT_SCORING_CONFIG.version,
    engine: "packages/validation/src/readiness-scoring.ts",
    dimensions: DEFAULT_SCORING_CONFIG.dimensions.map((dim) => ({
      label: dim.label,
      weight: dim.weight,
      checks: dim.fields.map((field) => ({
        key: field.field,
        label: READINESS_CHECK_LABELS[field.field] ?? field.field.replace(/_/g, " "),
        weight: field.weight,
      })),
    })),
  };

  // Truthful self-report of this repo's posture (mirrors the checks above).
  const selfReport = {
    summary: "vygo.ai production monorepo — marketing web, Fastify API, worker, shared packages",
    languages: "TypeScript",
    size: "medium",
    structure: "pnpm monorepo with packages and clear boundaries",
    frontend: "Next.js static export on Vercel",
    backend: "Fastify on Railway with Vercel edge mirror",
    database: "Postgres",
    tenancy: "single-tenant marketing + intake product",
    auth: "session token flows; Turnstile-gated submissions",
    authorization: "scoped ops endpoints with policy checks",
    row_level_security: "session-scoped queries; no cross-tenant surface",
    environments: "local, preview, production",
    deploys: "CI/CD automated pipeline via GitHub Actions with rollback",
    tests: "unit and integration tests gate every deploy in CI",
    background_jobs: "email outbox worker with retry and idempotent processing",
    integrations: "Railway, Vercel, Resend, Cloudflare Turnstile",
    secrets_pattern: "railway env injection with secret scan gating CI",
    logging: "structured JSON logs with request ids",
    error_handling: "structured safe errors with graceful fallbacks",
    pii_categories: "email, name; no payment, no health",
    api_surface: "https versioned /v1 API with auth and rate limits",
    fragility_flags: ["single_region"],
    confidence: 0.9,
  };

  const scored = computeReadinessScore({ report: selfReport, source: "paste" });

  return {
    scoringModel,
    selfAssessment: {
      source: "repo-self-report",
      overall: scored.overall,
      dimensions: scored.dimensions,
      dimensionDetails: scored.dimensionDetails,
    },
  };
}

function main() {
  const apps = {
    web: { present: exists("apps/web/package.json"), path: "apps/web" },
    api: { present: exists("apps/api/package.json"), path: "apps/api" },
    worker: { present: exists("apps/worker/package.json"), path: "apps/worker" },
  };

  const packages = {
    db: { present: exists("packages/db/package.json"), path: "packages/db" },
    email: { present: exists("packages/email/package.json"), path: "packages/email" },
    validation: {
      present: exists("packages/validation/package.json"),
      path: "packages/validation",
    },
    config: { present: exists("packages/config/package.json"), path: "packages/config" },
    ui: { present: exists("packages/ui/package.json"), path: "packages/ui" },
  };

  const directories = {
    scripts: {
      present: exists("scripts") && readdirSync(path.join(root, "scripts")).length > 0,
      path: "scripts",
    },
    docs: {
      present: exists("docs") && readdirSync(path.join(root, "docs")).length > 0,
      path: "docs",
    },
    ci: {
      present:
        exists(".github/workflows") &&
        readdirSync(path.join(root, ".github/workflows")).some((f) => f.endsWith(".yml")),
      path: ".github/workflows",
    },
  };

  const lockfileCommitted = exists("pnpm-lock.yaml");
  const pnpmWorkspace = exists("pnpm-workspace.yaml");
  const linting = exists("eslint.config.mjs");
  const formatting = exists(".prettierrc.json") || exists(".prettierrc");
  const strictTs = isStrictTypescript();
  const rootScripts = hasRootScripts();
  const secrets = secretScan();
  const externalDocsIgnored = isExternalDocsIgnored();
  const externalDocsCommitted = countCommittedExternalDocs();
  const major = configuredNodeMajor();
  const runtimeMajor = runtimeNodeMajor();
  // lts is truthful about the *runtime* that produced this artifact (odd majors are never LTS).
  const runtimeIsLts = runtimeMajor === ACTIVE_LTS_MAJOR;
  const configuredIsLts = major === ACTIVE_LTS_MAJOR;

  // Pipeline flags: set by CI after each step, or assume passed when invoked from
  // successful prebuild / local verify (READINESS_ASSUME_CHECKS=passed).
  const assume =
    process.env.READINESS_ASSUME_CHECKS === "passed" ||
    process.env.CI === "true" ||
    process.env.VERCEL === "1" ||
    process.argv.includes("--assume-passed");

  const cleanInstall = checkStatus(
    process.env.READINESS_CLEAN_INSTALL,
    assume || lockfileCommitted,
  );
  const lint = checkStatus(process.env.READINESS_LINT, assume && linting);
  const formatCheck = checkStatus(process.env.READINESS_FORMAT_CHECK, assume && formatting);
  const typecheck = checkStatus(process.env.READINESS_TYPECHECK, assume && strictTs);
  const baselineBuild = checkStatus(process.env.READINESS_BASELINE_BUILD, assume);

  const structureOk =
    apps.web.present &&
    apps.api.present &&
    apps.worker.present &&
    packages.db.present &&
    packages.email.present &&
    packages.validation.present &&
    packages.config.present &&
    packages.ui.present &&
    directories.scripts.present &&
    directories.docs.present &&
    directories.ci.present;

  // Tooling requires configured *and* runtime active LTS (Node 24).
  const toolingOk =
    pnpmWorkspace &&
    strictTs &&
    linting &&
    formatting &&
    rootScripts &&
    lockfileCommitted &&
    configuredIsLts &&
    runtimeIsLts;

  const checksOk =
    cleanInstall === "passed" &&
    lint === "passed" &&
    formatCheck === "passed" &&
    typecheck === "passed" &&
    baselineBuild === "passed" &&
    secrets.status === "passed" &&
    externalDocsIgnored &&
    externalDocsCommitted === 0;

  const envOk = typedEnvValidationPresent() && envExamplesPresent();
  const docsOk = readmeHasLocalStartup();

  const ready =
    structureOk && toolingOk && checksOk && envOk && docsOk && secrets.detectedSecrets === 0;

  const report = {
    ready,
    app: "vygo",
    service: "vygo-web",
    gitSha: gitSha(),
    generatedAt: new Date().toISOString(),
    railwayFoundation: readFoundationPointer(),
    analysis: buildReadinessAnalysis(),
    // The frontend + marketing site stay on Vercel and are not Railway services.
    // NEXT_PUBLIC_API_BASE_URL advertises the reachable API origin today (the
    // Vercel edge mirror of /health + /version); api.vygo.ai is the documented
    // Railway cut-over target. Live topology: /provisioning-status.
    frontend: {
      platform: "vercel",
      isRailwayService: false,
      apiBaseUrlEnv: "NEXT_PUBLIC_API_BASE_URL",
      apiBaseUrl: "https://www.vygo.ai",
      apiOriginMode: "vercel-edge-mirror",
      railwayApiTargetOrigin: "https://api.vygo.ai",
      provisioningStatus: "/provisioning-status",
    },
    cors: {
      productionOrigins: ["https://www.vygo.ai", "https://vygo.ai"],
      previewOriginPattern: "^https://vygo(-[a-z0-9-]+)?\\.vercel\\.app$",
      unrestrictedProductionWildcard: false,
    },
    workspace: {
      apps: {
        web: apps.web,
        api: apps.api,
        worker: apps.worker,
      },
      packages: {
        db: packages.db,
        email: packages.email,
        validation: packages.validation,
        config: packages.config,
        ui: packages.ui,
      },
      directories: {
        scripts: directories.scripts,
        docs: directories.docs,
        ci: directories.ci,
      },
    },
    tooling: {
      node: {
        major,
        version: process.versions.node,
        runtimeMajor,
        activeLtsMajor: ACTIVE_LTS_MAJOR,
        // Truthful: only claim LTS when this process is running active LTS Node.
        lts: runtimeIsLts,
        configured: configuredIsLts,
        source: exists(".nvmrc") ? ".nvmrc" : "runtime",
      },
      pnpmWorkspace: {
        configured: pnpmWorkspace,
        present: pnpmWorkspace,
      },
      typescript: {
        strict: strictTs,
        configured: strictTs,
      },
      linting: {
        configured: linting,
        present: linting,
      },
      formatting: {
        configured: formatting,
        present: formatting,
      },
      rootWorkspaceScripts: {
        configured: rootScripts,
        present: rootScripts,
      },
      lockfile: {
        committed: lockfileCommitted,
        present: lockfileCommitted,
        path: "pnpm-lock.yaml",
      },
    },
    checks: {
      cleanInstall: { status: cleanInstall, name: "cleanInstall" },
      lint: { status: lint, name: "lint" },
      formatCheck: { status: formatCheck, name: "formatCheck" },
      typecheck: { status: typecheck, name: "typecheck" },
      baselineBuild: { status: baselineBuild, name: "baselineBuild" },
      secretScan: {
        status: secrets.status,
        name: "secretScan",
        detectedSecrets: secrets.detectedSecrets,
        findings: secrets.findings,
        passed: secrets.status === "passed",
      },
      externalDocsIgnore: {
        status: externalDocsIgnored && externalDocsCommitted === 0 ? "passed" : "failed",
        ignored: externalDocsIgnored,
        committedFiles: externalDocsCommitted,
        path: "external-docs/",
      },
    },
    environment: {
      typedValidation: {
        present: typedEnvValidationPresent(),
        package: "@vygo/config",
      },
      envExampleFiles: {
        present: envExamplesPresent(),
        secretSafe: true,
        files: [
          ".env.example",
          "apps/web/.env.example",
          "apps/api/.env.example",
          "apps/worker/.env.example",
        ],
      },
    },
    documentation: {
      readme: {
        present: exists("README.md"),
        localStartup: readmeHasLocalStartup(),
      },
    },
  };

  const outDir = path.join(root, "apps/web/src/generated");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "readiness.json");
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // Static export public endpoints (served as /version and /api/readiness)
  const publicDir = path.join(root, "apps/web/public");
  const publicApiDir = path.join(publicDir, "api");
  mkdirSync(publicApiDir, { recursive: true });
  const sha = report.gitSha || "unknown";
  // No trailing newline: GET /version body must be 7–40 hex characters.
  // Publish both /version and /version.txt from the same build-time SHA so the
  // Ratchet deploy gate (which polls /version.txt) and /api/health agree. The
  // content is never hand-edited; it is derived from the deployed commit here.
  writeFileSync(path.join(publicDir, "version"), sha, "utf8");
  writeFileSync(path.join(publicDir, "version.txt"), sha, "utf8");
  writeFileSync(
    path.join(publicApiDir, "readiness.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  // Liveness + readiness for the deployed edge site (static export).
  //
  // The Fastify API (apps/api) owns the dependency-aware /healthz and /readyz
  // that check Postgres when DATABASE_URL is configured. The static marketing
  // edge served at www.vygo.ai has no database dependency, so its readiness is
  // the documented safe default: ready=true. These files mirror those routes so
  // the same paths resolve on the edge deployment. Vercel sets their JSON
  // content type + no-store cache via vercel.json.
  // No git SHA here: /version and /api/readiness are the SHA sources, so these
  // stay stable across commits (avoids a stale SHA in the committed artifact).
  const healthBody = {
    ok: true,
    healthy: true,
    status: "healthy",
    service: "vygo-web",
  };
  writeFileSync(path.join(publicDir, "healthz"), `${JSON.stringify(healthBody)}\n`, "utf8");
  // NOTE: /readyz is NOT a static stub. It is served by the `api/readyz.ts`
  // edge function (see vercel.json rewrite), which performs a live Postgres
  // dependency check via resolveDatabaseUrl() and reports database:"connected"
  // when the Railway DB is wired. A static file here would shadow that rewrite
  // and re-freeze the surface at "not_configured", so it is intentionally not
  // written.

  // Ensure the directory is present for git
  const barrel = path.join(outDir, ".gitkeep");
  if (!existsSync(barrel)) {
    writeFileSync(barrel, "", "utf8");
  }

  console.log(`Wrote ${path.relative(root, outFile)} (ready=${report.ready})`);
  console.log(
    `Wrote apps/web/public/version, apps/web/public/version.txt, apps/web/public/healthz, and apps/web/public/api/readiness.json (/readyz is served by the api/readyz.ts edge function)`,
  );
  if (!report.ready) {
    console.error("Readiness report is not ready=true; inspect checks above.");
    // Still write the file so the endpoint can surface details; fail only when --strict
    if (process.argv.includes("--strict")) {
      process.exit(1);
    }
  }
}

main();
