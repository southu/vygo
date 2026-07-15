/**
 * Build-time guard: the equity pricing model has been removed from the product.
 *
 * Equity-for-discount / dual cash-vs-equity pricing is no longer marketed or
 * offered in-product; equity deals are handled case-by-case offline. This guard
 * fails the build if equity-pricing copy or UI re-enters the user-facing source
 * (content and app trees), so the live site can never show it again.
 *
 * It intentionally does NOT scan docs/ (internal policy that documents the
 * removal) or e2e/ (the live-site guard, which references the phrases on purpose).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

// User-facing source trees only.
const scanRoots = [
  path.join(webRoot, "src/content"),
  path.join(webRoot, "src/app"),
];

// Any equity reference in user-facing content is a regression: there is no
// equity pricing offer. Keep this list aligned with the e2e site guard.
const EQUITY_PRICING_PATTERNS = [
  /equity/i,
  /\b(?:cash|equity)\s+or\s+(?:cash|equity)\b/i,
  /(?:request|apply for|pay with|trade|offer)\b[\s\S]{0,20}equity/i,
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".mdx"]);

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

const violations = [];
for (const root of scanRoots) {
  for (const file of collectFiles(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (EQUITY_PRICING_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push(`${path.relative(webRoot, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    "guard-equity-pricing: equity-pricing copy found in user-facing source.\n" +
      "The equity pricing model was removed; equity deals are handled offline.\n" +
      violations.map((v) => `  ${v}`).join("\n"),
  );
  process.exit(1);
}

console.log("guard-equity-pricing: OK (no equity-pricing copy in user-facing source)");
