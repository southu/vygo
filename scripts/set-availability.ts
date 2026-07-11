/**
 * Secure CLI for availability updates.
 * - Validates every argument
 * - Displays the current value before changes
 * - Requires explicit production confirmation (--confirm-production)
 * - Updates the singleton record transactionally
 * - Records updater attribution (--updated-by)
 *
 * Usage:
 *   pnpm availability:set --status waitlist --date 2026-08-17 --type audit \
 *     --note "Senior-only pods" --updated-by ops@example.com [--dry-run]
 */
import {
  assertDatabaseUrl,
  createDatabase,
  getSiteAvailability,
  runMigrations,
  setSiteAvailability,
  toPublicAvailability,
  type AvailabilitySetInput,
} from "@vygo/db";
import {
  availabilityStatusSchema,
  engagementTypeSchema,
  type AvailabilityStatus,
  type EngagementType,
} from "@vygo/validation";

function usage(exitCode = 1): never {
  console.log(`Usage:
  pnpm availability:set --status open|waitlist|paused [options]

Options:
  --status <open|waitlist|paused>   Required. Intake status.
  --date <YYYY-MM-DD>               Next opening date (ISO date).
  --type <audit|launch|scale|enterprise|general>
  --note <text>                     Display note shown publicly.
  --starts <n>                      Available starts count (non-negative integer).
  --updated-by <actor>              Attribution recorded on the row (not public).
  --dry-run                         Show current + proposed values; no write.
  --confirm-production              Required when NODE_ENV=production.
  --help                            Show this help.
`);
  process.exit(exitCode);
}

function argValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    usage(args.length === 0 ? 1 : 0);
  }

  const statusRaw = argValue(args, "--status");
  const statusParsed = availabilityStatusSchema.safeParse(statusRaw);
  if (!statusParsed.success) {
    console.error("Error: --status must be one of open|waitlist|paused");
    process.exit(1);
  }
  const status: AvailabilityStatus = statusParsed.data;

  const dateRaw = argValue(args, "--date");
  let nextOpeningDate: string | null = null;
  if (dateRaw !== undefined) {
    if (dateRaw === "" || dateRaw === "null") {
      nextOpeningDate = null;
    } else if (!isIsoDate(dateRaw)) {
      console.error("Error: --date must be YYYY-MM-DD");
      process.exit(1);
    } else {
      nextOpeningDate = dateRaw;
    }
  }

  const typeRaw = argValue(args, "--type");
  let engagementType: EngagementType = "audit";
  if (typeRaw !== undefined) {
    const typeParsed = engagementTypeSchema.safeParse(typeRaw);
    if (!typeParsed.success) {
      console.error("Error: --type must be one of audit|launch|scale|enterprise|general");
      process.exit(1);
    }
    engagementType = typeParsed.data;
  }

  const noteRaw = argValue(args, "--note");
  const displayNote = noteRaw === undefined ? null : noteRaw;

  const startsRaw = argValue(args, "--starts");
  let availableStarts: number | null = null;
  if (startsRaw !== undefined) {
    if (startsRaw === "" || startsRaw === "null") {
      availableStarts = null;
    } else {
      const n = Number(startsRaw);
      if (!Number.isInteger(n) || n < 0) {
        console.error("Error: --starts must be a non-negative integer");
        process.exit(1);
      }
      availableStarts = n;
    }
  }

  const updatedBy = argValue(args, "--updated-by") ?? process.env.USER ?? "cli";
  const dryRun = args.includes("--dry-run");
  const confirmProduction = args.includes("--confirm-production");
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (nodeEnv === "production" && !dryRun && !confirmProduction) {
    console.error("Error: production updates require --confirm-production (or use --dry-run).");
    process.exit(1);
  }

  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL);
  await runMigrations(databaseUrl);
  const handle = createDatabase(databaseUrl);

  try {
    const current = await getSiteAvailability(handle.db);
    const currentPublic = toPublicAvailability(current);

    const proposed: AvailabilitySetInput = {
      status,
      nextOpeningDate: dateRaw === undefined ? (current?.nextOpeningDate ?? null) : nextOpeningDate,
      engagementType:
        typeRaw === undefined
          ? ((current?.engagementType as EngagementType) ?? "audit")
          : engagementType,
      displayNote: noteRaw === undefined ? (current?.displayNote ?? null) : displayNote,
      availableStarts:
        startsRaw === undefined ? (current?.availableStarts ?? null) : availableStarts,
      updatedBy,
    };

    // Normalize date from DB (may be Date)
    if (proposed.nextOpeningDate && typeof proposed.nextOpeningDate !== "string") {
      proposed.nextOpeningDate = String(proposed.nextOpeningDate).slice(0, 10);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          current: {
            public: currentPublic,
            updatedBy: current?.updatedBy ?? null,
          },
          proposed: {
            status: proposed.status,
            nextOpeningDate: proposed.nextOpeningDate,
            engagementType: proposed.engagementType,
            displayNote: proposed.displayNote,
            availableStarts: proposed.availableStarts,
            updatedBy: proposed.updatedBy,
          },
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      console.log(
        JSON.stringify({ ok: true, message: "Dry run only — no database write performed." }),
      );
      return;
    }

    const row = await setSiteAvailability(handle.db, proposed);
    console.log(
      JSON.stringify(
        {
          ok: true,
          message: "Availability singleton updated.",
          public: toPublicAvailability(row),
          updatedBy: row.updatedBy,
        },
        null,
        2,
      ),
    );
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "availability:set failed";
  // Never print connection strings or stacks with secrets.
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
