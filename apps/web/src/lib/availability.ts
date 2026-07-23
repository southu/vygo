import type { PublicAvailability } from "@vygo/validation";

/** UI states the availability surface must render distinctly for tests. */
export type AvailabilityUiState = "loading" | "open" | "waitlist" | "paused" | "stale" | "error";

/** Client marks data stale slightly after API max-age (60s). */
export const AVAILABILITY_STALE_MS = 90_000;

export const AVAILABILITY_POLL_MS = 60_000;

export type AvailabilitySnapshot = {
  uiState: AvailabilityUiState;
  data: PublicAvailability | null;
  /** Last successfully fetched payload (retained across stale/error when possible). */
  lastGood: PublicAvailability | null;
  fetchedAt: number | null;
  errorMessage: string | null;
  isBusy: boolean;
};

export function initialAvailabilitySnapshot(): AvailabilitySnapshot {
  return {
    uiState: "loading",
    data: null,
    lastGood: null,
    fetchedAt: null,
    errorMessage: null,
    isBusy: true,
  };
}

export function deriveUiState(input: {
  loading: boolean;
  error: boolean;
  data: PublicAvailability | null;
  lastGood: PublicAvailability | null;
  fetchedAt: number | null;
  now?: number;
}): AvailabilityUiState {
  const now = input.now ?? Date.now();

  if (input.loading && !input.lastGood && !input.data) {
    return "loading";
  }

  if (input.error && !input.lastGood && !input.data) {
    return "error";
  }

  const effective = input.data ?? input.lastGood;
  const isStaleByAge = input.fetchedAt != null && now - input.fetchedAt > AVAILABILITY_STALE_MS;
  const isStaleByError = input.error && Boolean(input.lastGood);

  if (isStaleByAge || isStaleByError) {
    return "stale";
  }

  if (!effective) {
    return input.loading ? "loading" : "error";
  }

  if (effective.status === "open") return "open";
  if (effective.status === "waitlist") return "waitlist";
  if (effective.status === "paused") return "paused";
  return "error";
}

export type AvailabilityCopy = {
  label: string;
  message: string;
  note?: string;
  /** Primary action kind for CTAs. */
  action: "open-access" | "open-waitlist" | "none" | "apply";
  ctaLabel: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Format a DB-supplied ISO date (YYYY-MM-DD) as a human, month-name date such as
 * "August 24, 2026". Parsed positionally to avoid timezone drift. Returns null
 * for a missing or malformed value so callers can fall back to prose.
 */
export function formatOpeningDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function availabilityCopy(
  uiState: AvailabilityUiState,
  data: PublicAvailability | null,
): AvailabilityCopy {
  const note = data?.displayNote ?? undefined;
  const date = formatOpeningDate(data?.nextOpeningDate) ?? data?.nextOpeningDate ?? null;

  switch (uiState) {
    case "loading":
      return {
        label: "CHECKING AVAILABILITY",
        message: "Loading current availability…",
        action: "none",
        ctaLabel: "Loading",
      };
    case "open":
      return {
        label: "OPENINGS AVAILABLE",
        message: date
          ? `We are accepting applications for openings around ${date}.`
          : "We are accepting applications for the next production opening.",
        note,
        action: "open-access",
        ctaLabel: "Apply for the next opening",
      };
    case "waitlist":
      return {
        label: "WAITLIST OPEN",
        message: date
          ? `Join the waitlist for the next opening${date ? ` (target ${date})` : ""}.`
          : "Join the waitlist for the next production opening.",
        note,
        action: "open-waitlist",
        ctaLabel: "Join the waitlist",
      };
    case "paused":
      return {
        label: "ENROLLMENT PAUSED",
        message:
          "Enrollment is paused right now. We are not accepting new applications at this moment.",
        note,
        action: "none",
        ctaLabel: "Enrollment paused",
      };
    case "stale":
      return {
        label: "AVAILABILITY MAY BE OUT OF DATE",
        message: data
          ? `Last known status: ${data.status}. Apply for the next opening below.`
          : "Availability data may be out of date. Apply for the next opening below.",
        note,
        action: "apply",
        ctaLabel: "Apply",
      };
    case "error":
    default:
      return {
        label: "AVAILABILITY UNAVAILABLE",
        message:
          "We could not load current availability. You can still apply below, or email hello [at] vygo.ai.",
        action: "apply",
        ctaLabel: "Apply",
      };
  }
}
