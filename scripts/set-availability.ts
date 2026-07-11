/**
 * Safe CLI for next-opening updates (scaffold).
 * Full transactional update lands when the availability table exists.
 */
const args = process.argv.slice(2);

function usage(): never {
  console.log(`Usage:
  pnpm availability:set --status open|waitlist|paused [--label "March 2027"] [--dry-run]

This scaffold validates arguments only. Database writes are not enabled yet.
`);
  process.exit(1);
}

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  usage();
}

const statusIdx = args.indexOf("--status");
const status = statusIdx >= 0 ? args[statusIdx + 1] : undefined;
const allowed = new Set(["open", "waitlist", "paused"]);

if (!status || !allowed.has(status)) {
  console.error("Error: --status must be one of open|waitlist|paused");
  process.exit(1);
}

const labelIdx = args.indexOf("--label");
const label = labelIdx >= 0 ? args[labelIdx + 1] : null;
const dryRun = args.includes("--dry-run");

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      wouldSet: {
        status,
        nextOpeningLabel: label,
      },
      message: dryRun
        ? "Dry run only — no database write performed."
        : "Scaffold mode — no database write performed. Use --dry-run to silence this note later.",
    },
    null,
    2,
  ),
);
