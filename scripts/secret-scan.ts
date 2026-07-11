/**
 * Lightweight repository secret scan.
 * Fails on high-confidence credential patterns in tracked source (not lockfiles).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SKIP_PREFIXES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "apps/web/src/generated/",
];

const SKIP_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
]);

/** Patterns that indicate real secrets (not placeholders). */
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  {
    name: "generic-api-key-assignment",
    re: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/gi,
  },
  {
    name: "private-key-block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "github-pat",
    re: /ghp_[A-Za-z0-9]{36,}/g,
  },
  {
    name: "slack-token",
    re: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    name: "stripe-live-key",
    re: /sk_live_[A-Za-z0-9]{20,}/g,
  },
];

function listTrackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !SKIP_PREFIXES.some((p) => file === p || file.startsWith(p)))
    .filter((file) => !SKIP_EXT.has(path.extname(file).toLowerCase()));
}

function scan(): { status: "passed" | "failed"; detectedSecrets: number; findings: string[] } {
  const findings: string[] = [];
  for (const file of listTrackedFiles()) {
    let content: string;
    try {
      content = readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    // Skip binary-ish content
    if (content.includes("\u0000")) continue;

    for (const pattern of PATTERNS) {
      pattern.re.lastIndex = 0;
      if (pattern.re.test(content)) {
        findings.push(`${file}: matched ${pattern.name}`);
      }
    }
  }

  return {
    status: findings.length === 0 ? "passed" : "failed",
    detectedSecrets: findings.length,
    findings,
  };
}

const result = scan();

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  if (result.status === "passed") {
    console.log("secret-scan: passed (no repository secrets detected)");
  } else {
    console.error("secret-scan: failed");
    for (const finding of result.findings) {
      console.error(`  - ${finding}`);
    }
  }
}

if (result.status !== "passed") {
  process.exit(1);
}
