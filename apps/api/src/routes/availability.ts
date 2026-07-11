import type { FastifyInstance } from "fastify";
import {
  computeAvailabilityEtag,
  getSiteAvailability,
  NEUTRAL_PUBLIC_AVAILABILITY,
  toPublicAvailability,
  type DatabaseHandle,
} from "@vygo/db";
import { publicAvailabilitySchema } from "@vygo/validation";

export const AVAILABILITY_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=240";

function parseIfNoneMatch(header: string | string[] | undefined): string[] {
  if (!header) return [];
  const raw = Array.isArray(header) ? header.join(",") : header;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function etagMatches(etag: string, candidates: string[]): boolean {
  for (const c of candidates) {
    if (c === "*") return true;
    // Weak comparison: strip W/ prefix
    const normalized = c.startsWith("W/") ? c.slice(2).trim() : c;
    if (normalized === etag) return true;
  }
  return false;
}

export function registerAvailabilityRoutes(
  app: FastifyInstance,
  getDb: () => DatabaseHandle | null,
): void {
  app.get("/v1/public/availability", async (request, reply) => {
    let publicData = { ...NEUTRAL_PUBLIC_AVAILABILITY };

    const handle = getDb();
    if (handle) {
      try {
        const row = await getSiteAvailability(handle.db);
        publicData = toPublicAvailability(row);
      } catch (error) {
        request.log.warn(
          { err: error instanceof Error ? { message: error.message } : {} },
          "availability lookup failed; returning neutral safe response",
        );
        publicData = { ...NEUTRAL_PUBLIC_AVAILABILITY };
      }
    }

    // Validate shape before sending (malformed internal mapping → neutral).
    const parsed = publicAvailabilitySchema.safeParse(publicData);
    if (!parsed.success) {
      publicData = { ...NEUTRAL_PUBLIC_AVAILABILITY };
    } else {
      publicData = parsed.data;
    }

    const etag = computeAvailabilityEtag(publicData);
    const inm = parseIfNoneMatch(request.headers["if-none-match"]);

    void reply.header("Cache-Control", AVAILABILITY_CACHE_CONTROL);
    void reply.header("ETag", etag);
    void reply.header("Vary", "Origin, Accept-Encoding");

    if (etagMatches(etag, inm)) {
      return reply.status(304).send();
    }

    return reply.status(200).send({ data: publicData });
  });
}
