import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export type WorkerHeartbeat = {
  workerName: string;
  status: string;
  lastSeenAt: Date;
  details: Record<string, unknown>;
};

export async function upsertWorkerHeartbeat(
  db: Db,
  input: {
    workerName: string;
    status?: string;
    details?: Record<string, unknown>;
    now?: Date;
  },
): Promise<void> {
  const nowIso = (input.now ?? new Date()).toISOString();
  const status = input.status ?? "ready";
  const details = JSON.stringify(input.details ?? {});
  await db.execute(sql`
    INSERT INTO worker_heartbeats (worker_name, status, last_seen_at, details)
    VALUES (${input.workerName}, ${status}, ${nowIso}::timestamptz, ${details}::jsonb)
    ON CONFLICT (worker_name) DO UPDATE SET
      status = EXCLUDED.status,
      last_seen_at = EXCLUDED.last_seen_at,
      details = EXCLUDED.details
  `);
}

export async function getWorkerHeartbeat(
  db: Db,
  workerName = "email-worker",
): Promise<WorkerHeartbeat | null> {
  try {
    const result = await db.execute(sql`
      SELECT worker_name, status, last_seen_at, details
      FROM worker_heartbeats
      WHERE worker_name = ${workerName}
      LIMIT 1
    `);
    const rows =
      (result as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (Array.isArray(result) ? (result as unknown as Record<string, unknown>[]) : []);
    const row = rows[0];
    if (!row) return null;
    return {
      workerName: String(row.worker_name ?? row.workerName),
      status: String(row.status),
      lastSeenAt: new Date(String(row.last_seen_at ?? row.lastSeenAt)),
      details:
        typeof row.details === "object" && row.details
          ? (row.details as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

/**
 * Worker is ready when a heartbeat exists and is fresher than maxAgeMs (default 60s).
 */
export function isWorkerHeartbeatFresh(
  heartbeat: WorkerHeartbeat | null,
  options?: { maxAgeMs?: number; now?: Date },
): boolean {
  if (!heartbeat) return false;
  if (heartbeat.status !== "ready" && heartbeat.status !== "running") return false;
  const maxAgeMs = options?.maxAgeMs ?? 60_000;
  const now = options?.now ?? new Date();
  return now.getTime() - heartbeat.lastSeenAt.getTime() <= maxAgeMs;
}
