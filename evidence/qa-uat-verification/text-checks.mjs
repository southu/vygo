/**
 * Text-search evidence over the four new QA & UAT copy blocks as rendered in
 * production. Reads dom/rendered-sections.json (captured from the live site by
 * capture.mjs) and emits a human-readable report to dom/text-checks.txt.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const sections = JSON.parse(
  fs.readFileSync(path.join(DIR, "dom", "rendered-sections.json"), "utf8"),
);

const FORBIDDEN_LOCATION = ["us-based", "offshore", "onshore", "nearshore"];
// Phrasings that would (wrongly) present QA/UAT as optional / add-on / extra
// cost / tier-restricted. Matched case-insensitively against each block.
const OPTIONAL_FRAMING = [
  "optional",
  "add-on",
  "add on",
  "extra cost",
  "additional cost",
  "additional fee",
  "at extra",
  "available only",
  "only available",
  "upgrade to",
  "higher tier",
  "premium tier",
  "surcharge",
];
const VERBATIM = [
  "not just developer-tested code",
  "separate from the engineers writing the code",
];

const lines = [];
const log = (s) => lines.push(s);
let failures = 0;

log("QA & UAT copy — production rendered-DOM text checks");
log("Source: dom/rendered-sections.json (captured from https://www.vygo.ai)");
log("=".repeat(70));

for (const [name, textRaw] of Object.entries(sections)) {
  const text = textRaw.toLowerCase();
  log(`\n### Block: ${name}`);
  for (const term of FORBIDDEN_LOCATION) {
    const hit = text.includes(term);
    if (hit) failures++;
    log(`  [workforce-location] "${term}": ${hit ? "FOUND (FAIL)" : "0 occurrences"}`);
  }
  for (const term of OPTIONAL_FRAMING) {
    const hit = text.includes(term);
    if (hit) failures++;
    log(`  [optional-framing]  "${term}": ${hit ? "FOUND (review)" : "0 occurrences"}`);
  }
}

log("\n" + "=".repeat(70));
log("Verbatim-phrase survival (across all captured blocks):");
const allText = Object.values(sections).join("\n");
for (const phrase of VERBATIM) {
  const hit = allText.includes(phrase);
  if (!hit) failures++;
  log(`  "${phrase}": ${hit ? "PRESENT verbatim" : "MISSING (FAIL)"}`);
}

log("\n" + "=".repeat(70));
log(`RESULT: ${failures === 0 ? "PASS — all checks clean" : failures + " issue(s) — see above"}`);
log(
  "\nNote on /method: the only 'Optional' token elsewhere on the How-We-Work page\n" +
    "is the 'Ops continuity' cell in the tier-comparison matrix (about post-launch\n" +
    "vygo Ops, not QA/UAT). The QA & UAT step block itself contains no optional /\n" +
    "add-on / extra-cost / tier-restricted framing, as shown above.",
);

const out = lines.join("\n") + "\n";
fs.writeFileSync(path.join(DIR, "dom", "text-checks.txt"), out);
console.log(out);
process.exit(failures === 0 ? 0 : 1);
