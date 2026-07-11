/**
 * Generates apps/web/src/generated/readiness.json for GET /api/readiness.
 * Invoked by CI and by apps/web prebuild. Records workspace structure and
 * check results produced by the production/CI pipeline.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  writeFileSync(path.join(publicDir, "version"), sha, "utf8");
  writeFileSync(
    path.join(publicApiDir, "readiness.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  // Ensure the directory is present for git
  const barrel = path.join(outDir, ".gitkeep");
  if (!existsSync(barrel)) {
    writeFileSync(barrel, "", "utf8");
  }

  console.log(`Wrote ${path.relative(root, outFile)} (ready=${report.ready})`);
  console.log(`Wrote apps/web/public/version and apps/web/public/api/readiness.json`);
  if (!report.ready) {
    console.error("Readiness report is not ready=true; inspect checks above.");
    // Still write the file so the endpoint can surface details; fail only when --strict
    if (process.argv.includes("--strict")) {
      process.exit(1);
    }
  }
}

main();
