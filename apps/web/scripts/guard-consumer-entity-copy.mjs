/**
 * Build-time guard: keep consumer-facing marketing/product copy free of
 * corporate-entity and legal-handoff phrasing that belongs only in the privacy
 * policy and terms of use.
 *
 * Prohibited on consumer surfaces (case-insensitive):
 *   - "operated by VYGO LLC"
 *   - "VYGO LLC"
 *   - "operated by" (entity operator phrasing)
 *   - "separately executed agreement"
 *   - P-handoff legal boilerplate (client-relationship / services-begin /
 *     notices-effective lines that were previously pasted into marketing copy)
 *
 * Legal pack sources are intentionally excluded: legal.ts, /privacy, /terms,
 * and the published markdown mirrors under public/docs/vygo/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "../..");

const scanRoots = [
  path.join(webRoot, "src/content"),
  path.join(webRoot, "src/app"),
  path.join(webRoot, "src/components"),
  path.join(webRoot, "public"),
  path.join(repoRoot, "packages/ui/src"),
  path.join(repoRoot, "packages/email/src"),
];

/** Paths that may retain legal-entity language (privacy/terms pack only). */
const EXCLUDE_PATH_RES = [
  /[/\\]content[/\\]legal\.ts$/,
  /[/\\]app[/\\]privacy[/\\]/,
  /[/\\]app[/\\]terms[/\\]/,
  /[/\\]public[/\\]docs[/\\]vygo[/\\]/,
  /[/\\]components[/\\]LegalDocumentView\.tsx$/,
];

/**
 * site.ts holds SEO descriptions for /privacy and /terms only. Those pages are
 * out of scope for this guard; the legal body still comes from legal.ts.
 */
const EXCLUDE_LINE_RES = [
  /privacyDescription\s*:/,
  /termsDescription\s*:/,
  /Privacy Policy for VYGO LLC/,
  /Terms of Use for the vygo\.ai website and waitlist features operated by VYGO LLC/,
];

const PROHIBITED_PATTERNS = [
  { name: "operated by VYGO LLC", re: /operated\s+by\s+VYGO\s+LLC/i },
  { name: "VYGO LLC", re: /VYGO\s+LLC/i },
  { name: "operated by", re: /operated\s+by/i },
  { name: "separately executed agreement", re: /separately\s+executed\s+agreement/i },
  {
    name: "P-handoff (form a client relationship)",
    re: /does\s+not\s+form\s+a\s+client\s+relationship/i,
  },
  {
    name: "P-handoff (services begin only under a separately executed agreement)",
    re: /Services\s+begin\s+only\s+under\s+a\s+separately\s+executed\s+agreement/i,
  },
  {
    name: "P-handoff (Notices are effective when received)",
    re: /Notices\s+are\s+effective\s+when\s+received/i,
  },
];

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".html",
]);

function collectFiles(dir) {
  let files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      files = files.concat(collectFiles(full));
    } else if (SCAN_EXTENSIONS.has(path.extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function isExcludedPath(file) {
  return EXCLUDE_PATH_RES.some((re) => re.test(file));
}

function isExcludedLine(line) {
  return EXCLUDE_LINE_RES.some((re) => re.test(line));
}

const violations = [];
for (const root of scanRoots) {
  for (const file of collectFiles(root)) {
    if (isExcludedPath(file)) continue;
    const relative =
      file.startsWith(webRoot) ?
        path.relative(webRoot, file)
      : path.relative(repoRoot, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (isExcludedLine(line)) return;
      for (const { name, re } of PROHIBITED_PATTERNS) {
        if (re.test(line)) {
          violations.push(`${relative}:${index + 1}: [${name}] ${line.trim()}`);
          break;
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    "guard-consumer-entity-copy: prohibited entity/legal-handoff copy found in consumer-facing source.\n" +
      "Use plain 'VYGO' on marketing/product surfaces. Keep entity language only in the privacy/terms legal pack.\n" +
      violations.map((v) => `  ${v}`).join("\n"),
  );
  process.exit(1);
}

console.log(
  "guard-consumer-entity-copy: OK (no prohibited entity/handoff copy in consumer-facing source)",
);
