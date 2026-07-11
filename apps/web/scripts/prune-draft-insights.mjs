/**
 * After static export, remove HTML for unpublished insight drafts so those
 * URLs 404 on the static host instead of serving a soft error document.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const outDir = path.join(webRoot, "out");
const contentPath = path.join(webRoot, "src/content/insights.ts");

if (!existsSync(outDir) || !existsSync(contentPath)) {
  process.exit(0);
}

const source = readFileSync(contentPath, "utf8");
const slugRegex = /slug:\s*"([^"]+)"[\s\S]*?status:\s*"(draft|published)"/g;
const drafts = [];
let match;
while ((match = slugRegex.exec(source)) !== null) {
  if (match[2] === "draft") drafts.push(match[1]);
}

for (const slug of drafts) {
  for (const rel of [
    path.join("insights", `${slug}.html`),
    path.join("insights", `${slug}.txt`),
    path.join("insights", slug, "index.html"),
  ]) {
    const full = path.join(outDir, rel);
    if (existsSync(full)) {
      rmSync(full, { force: true });
      console.log(`pruned draft export: ${rel}`);
    }
  }
}
