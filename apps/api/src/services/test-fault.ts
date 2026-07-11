import type { WaitlistRepositoryOptions } from "@vygo/db";

/**
 * In-process fault injection for non-production test surface only.
 * Arms lead- or outbox-persistence failure for the next N waitlist intakes.
 * Never activatable from production request fields; the waitlist route only
 * consults this when `isTestSurfaceEnabled` is true.
 */

export type TestFaultMode = "none" | "lead" | "outbox";

type ArmedFault = {
  mode: "lead" | "outbox";
  remaining: number;
};

let armed: ArmedFault | null = null;

export function setTestFault(mode: TestFaultMode, count = 1): {
  mode: TestFaultMode;
  remaining: number;
} {
  if (mode === "none" || count <= 0) {
    armed = null;
    return { mode: "none", remaining: 0 };
  }
  armed = { mode, remaining: Math.min(Math.floor(count), 10) };
  return { mode: armed.mode, remaining: armed.remaining };
}

export function peekTestFault(): { mode: TestFaultMode; remaining: number } {
  if (!armed || armed.remaining <= 0) {
    return { mode: "none", remaining: 0 };
  }
  return { mode: armed.mode, remaining: armed.remaining };
}

/** Consume one armed fault for the next persist attempt. */
export function consumeTestFault(): WaitlistRepositoryOptions {
  if (!armed || armed.remaining <= 0) {
    armed = null;
    return {};
  }
  const mode = armed.mode;
  armed.remaining -= 1;
  if (armed.remaining <= 0) {
    armed = null;
  }
  return mode === "lead" ? { faultLead: true } : { faultOutbox: true };
}
