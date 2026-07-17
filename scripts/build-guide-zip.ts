/**
 * Builds the downloadable Ratchet guide pack zip served as a static file at
 * /content/vibe-coding/ratchet-guide-<version>.zip.
 *
 * The archive is assembled at build/deploy time (apps/web prebuild) from the
 * sanitized pack committed at content/vibe-coding/ratchet-guide/ — there is no
 * upload path, no admin UI, and no runtime service behind the download. The
 * output is committed under apps/web/public/ and regenerated on every build.
 *
 * Determinism: entries are sorted, every entry carries the fixed DOS epoch
 * timestamp (1980-01-01 00:00:00), and files are stored uncompressed, so two
 * runs over the same pack produce byte-identical zips and the served file is
 * a stable static artifact rather than a per-request assembly.
 *
 * Fail-closed: the pack is scanned for high-confidence credential shapes
 * (same pattern families as scripts/secret-scan.ts) before packaging; any
 * match aborts the build instead of shipping a tainted archive.
 *
 * Pure Node — no new dependencies. If the pack version in manifest.json
 * changes, the zip filename changes with it; update the matching offer href
 * in apps/web/src/content/guide-offer.ts at the same time.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const PACK_DIR = path.join(repoRoot, "content", "vibe-coding", "ratchet-guide");
const OUT_DIR = path.join(repoRoot, "apps", "web", "public", "content", "vibe-coding");

/** High-confidence credential shapes — mirror of scripts/secret-scan.ts. */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  {
    name: "generic-api-key-assignment",
    re: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/i,
  },
  { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "github-pat", re: /ghp_[A-Za-z0-9]{36,}/ },
  { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "stripe-live-key", re: /sk_live_[A-Za-z0-9]{20,}/ },
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fixed DOS date for every entry: 1980-01-01 (the zip epoch). */
const DOS_DATE = ((1980 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

type ZipEntry = { name: string; data: Buffer };

/** Minimal stored-method (uncompressed) zip writer with no extra fields. */
function buildZip(entries: ZipEntry[]): Buffer {
  const body: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    body.push(local, nameBuf, data);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); // central directory signature
    record.writeUInt16LE(20, 4); // version made by
    record.writeUInt16LE(20, 6); // version needed
    record.writeUInt16LE(0, 8); // flags
    record.writeUInt16LE(0, 10); // method: stored
    record.writeUInt16LE(DOS_TIME, 12);
    record.writeUInt16LE(DOS_DATE, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(nameBuf.length, 28);
    record.writeUInt32LE(offset, 42); // local header offset
    central.push(record, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16); // central directory offset
  return Buffer.concat([...body, directory, end]);
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function main(): void {
  const manifest = JSON.parse(readFileSync(path.join(PACK_DIR, "manifest.json"), "utf8")) as {
    version: string;
  };
  const version = manifest.version;
  if (!version) {
    throw new Error("build-guide-zip: pack manifest.json has no version");
  }

  const dirents = readdirSync(PACK_DIR, { withFileTypes: true });
  if (dirents.some((entry) => entry.isDirectory())) {
    throw new Error("build-guide-zip: pack directory must stay flat (no subdirectories)");
  }
  const filenames = dirents
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.endsWith(".zip"))
    .sort();

  // Fail closed: never package credential-shaped content.
  const files = filenames.map((name) => ({
    name,
    data: readFileSync(path.join(PACK_DIR, name)),
  }));
  for (const { name, data } of files) {
    const text = data.toString("utf8");
    for (const { name: patternName, re } of SECRET_PATTERNS) {
      if (re.test(text)) {
        throw new Error(
          `build-guide-zip: refusing to package ${name} — matched ${patternName}. ` +
            "The guide pack must stay sanitized (no keys, tokens, or credentials).",
        );
      }
    }
  }

  const manifestLines = [
    "Ratchet system guide — downloadable pack archive",
    `Version: ${version}`,
    "",
    "Built at deploy time from the sanitized documentation pack committed at",
    "content/vibe-coding/ratchet-guide/ in the vygo repository. Deterministic:",
    "sorted entries, fixed timestamps, stored uncompressed.",
    "",
    "This archive is product-design documentation only. It contains no API keys,",
    "no vault passwords, and no host credentials. It describes public-safe",
    "educational product concepts — not install trees, private UI/API topology,",
    "environment key catalogs, or host operations runbooks. This pack is not",
    "access to anyone's running VPC.",
    "",
    "Files in this archive (<sha256>  <bytes>  <path>):",
    ...files.map(({ name, data }) => `${sha256(data)}  ${data.length}  ${name}`),
    "",
    "MANIFEST.txt (this file) is the archive manifest; it is not part of the",
    "pack file list above.",
    "",
  ];
  const entries: ZipEntry[] = [
    ...files.map(({ name, data }) => ({ name, data })),
    { name: "MANIFEST.txt", data: Buffer.from(manifestLines.join("\n"), "utf8") },
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const zip = buildZip(entries);
  mkdirSync(OUT_DIR, { recursive: true });
  const outName = `ratchet-guide-${version}.zip`;
  const outPath = path.join(OUT_DIR, outName);
  writeFileSync(outPath, zip);

  console.log(
    `build-guide-zip: wrote apps/web/public/content/vibe-coding/${outName} ` +
      `(${entries.length} entries, ${zip.length} bytes, sha256 ${sha256(zip)})`,
  );
}

main();
