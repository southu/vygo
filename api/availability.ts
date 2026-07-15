/**
 * GET /api/availability — public availability surface served on the marketing
 * edge (www.vygo.ai). The site's `vercel.json` rewrites the documented
 * `GET /v1/public/availability` path to this function, so the static frontend
 * reads the next available audit start date (and intake status) directly from
 * the Railway-backed Postgres `site_availability` singleton — never from a
 * hardcoded frontend constant.
 *
 * Source of truth: the `site_availability` row (id = 'main'). Operators change
 * the next audit start date with the documented admin path
 * (`pnpm availability:set --status … --date YYYY-MM-DD --type audit`) and it is
 * reflected here on the next request with no redeploy of static copy.
 *
 * Bootstrap: if the singleton is absent, this function seeds it once
 * (INSERT … ON CONFLICT (id) DO NOTHING) with the current next audit start date
 * so a fresh database serves the value immediately; a later operator update is
 * never overwritten. When no database is configured (or a lookup fails), it
 * still returns the same server-computed default so the surface never breaks —
 * this is a server response, not a client-only constant.
 *
 * Never exposes DATABASE_URL, connection strings, updater attribution, SQL, or
 * stack traces in a response.
 */
import postgres from "postgres";
import type { Sql } from "postgres";
import { applyCorsAndMaybePreflight } from "./_lib/meta.js";
import type { EdgeRequest, EdgeResponse } from "./_lib/http.js";
import { resolveDatabaseUrl } from "./_lib/store.js";

/**
 * Next available audit start date (ISO date). August 24 of the upcoming
 * production window. This is the seed/fallback default only — once present in
 * the database, the stored value is authoritative and operator-editable.
 */
export const NEXT_AUDIT_START_DATE = "2026-08-24";

const DEFAULT_DISPLAY_NOTE = "Senior-only pods. Limited concurrent engagements.";

type PublicAvailability = {
  status: "open" | "waitlist" | "paused";
  nextOpeningDate: string | null;
  engagementType: "audit" | "launch" | "scale" | "enterprise" | "general";
  displayNote: string | null;
  availableStarts: number | null;
  updatedAt: string;
};

const ALLOWED_STATUS = new Set(["open", "waitlist", "paused"]);
const ALLOWED_ENGAGEMENT = new Set(["audit", "launch", "scale", "enterprise", "general"]);

/** Server-computed default. Used to seed a fresh DB and as a safe fallback. */
function defaultAvailability(now: Date): PublicAvailability {
  return {
    status: "waitlist",
    nextOpeningDate: NEXT_AUDIT_START_DATE,
    engagementType: "audit",
    displayNote: DEFAULT_DISPLAY_NOTE,
    availableStarts: null,
    updatedAt: now.toISOString(),
  };
}

let cachedSql: Sql | null = null;
let cachedUrl: string | null = null;

function getSql(url: string): Sql {
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    cachedUrl = url;
  }
  return cachedSql;
}

type AvailabilityRow = {
  status: string;
  next_opening_date: string | null;
  engagement_type: string;
  display_note: string | null;
  available_starts: number | null;
  updated_at: Date | string;
};

function toIso(value: Date | string, now: Date): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? now.toISOString() : value.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? now.toISOString() : d.toISOString();
}

/** Map a database row to the documented public availability contract. */
function toPublicAvailability(row: AvailabilityRow, now: Date): PublicAvailability {
  const fallback = defaultAvailability(now);
  const status = ALLOWED_STATUS.has(row.status)
    ? (row.status as PublicAvailability["status"])
    : fallback.status;
  const engagementType = ALLOWED_ENGAGEMENT.has(row.engagement_type)
    ? (row.engagement_type as PublicAvailability["engagementType"])
    : fallback.engagementType;

  let nextOpeningDate: string | null = null;
  if (
    typeof row.next_opening_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.next_opening_date)
  ) {
    nextOpeningDate = row.next_opening_date;
  }

  let availableStarts: number | null = null;
  if (
    typeof row.available_starts === "number" &&
    Number.isFinite(row.available_starts) &&
    row.available_starts >= 0
  ) {
    availableStarts = row.available_starts;
  }

  return {
    status,
    nextOpeningDate,
    engagementType,
    displayNote: row.display_note ?? null,
    availableStarts,
    updatedAt: toIso(row.updated_at, now),
  };
}

/**
 * Read the availability singleton from Railway Postgres, seeding the current
 * next audit start date once if the row does not yet exist.
 */
async function readFromDatabase(sql: Sql, now: Date): Promise<PublicAvailability> {
  // Seed-once: never overwrites an existing operator-managed row.
  await sql`
    INSERT INTO site_availability (id, status, next_opening_date, engagement_type, display_note, updated_by)
    VALUES ('main', 'waitlist', ${NEXT_AUDIT_START_DATE}, 'audit', ${DEFAULT_DISPLAY_NOTE}, 'edge-seed')
    ON CONFLICT (id) DO NOTHING
  `;

  const rows = await sql<AvailabilityRow[]>`
    SELECT
      status,
      to_char(next_opening_date, 'YYYY-MM-DD') AS next_opening_date,
      engagement_type,
      display_note,
      available_starts,
      updated_at
    FROM site_availability
    WHERE id = 'main'
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return defaultAvailability(now);
  return toPublicAvailability(row, now);
}

export default async function handler(req: EdgeRequest, res: EdgeResponse): Promise<void> {
  if (applyCorsAndMaybePreflight(req, res)) return;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=240");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin, Accept-Encoding");

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  const now = new Date();
  const url = resolveDatabaseUrl();

  // Defense in depth: any unexpected throw collapses to the safe server default
  // (still a data-backed contract shape) rather than Vercel's default error page.
  try {
    const data = url ? await readFromDatabase(getSql(url), now) : defaultAvailability(now);
    res.status(200).json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability lookup failed";
    console.error(JSON.stringify({ event: "availability_edge_error", message }));
    res.status(200).json({ data: defaultAvailability(now) });
  }
}
