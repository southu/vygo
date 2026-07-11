import { createHmac } from "node:crypto";
import type { ApiEnv } from "@vygo/config";

export type IpHashResult = {
  /** Versioned hash: `v{N}:{hex}` */
  hash: string;
  version: number;
  /** All hashes that should match during the rotation window (current + previous). */
  rotationHashes: string[];
};

/**
 * Hash a client IP with a versioned, rotating salt.
 * Never log or persist the raw IP — only the versioned digest.
 */
export function hashIpAddress(
  ip: string,
  env: Pick<
    ApiEnv,
    | "IP_HASH_SALT"
    | "IP_HASH_SALT_PREVIOUS"
    | "IP_HASH_SALT_VERSION"
    | "IP_HASH_SALT_PREVIOUS_VERSION"
  >,
): IpHashResult | null {
  const salt = env.IP_HASH_SALT;
  if (!salt) return null;

  const version = env.IP_HASH_SALT_VERSION;
  const current = digest(ip, salt, version);
  const rotationHashes = [current];

  if (env.IP_HASH_SALT_PREVIOUS) {
    const prevVersion = env.IP_HASH_SALT_PREVIOUS_VERSION ?? Math.max(1, version - 1);
    rotationHashes.push(digest(ip, env.IP_HASH_SALT_PREVIOUS, prevVersion));
  }

  return { hash: current, version, rotationHashes };
}

function digest(ip: string, salt: string, version: number): string {
  const hex = createHmac("sha256", salt).update(ip).digest("hex");
  return `v${version}:${hex}`;
}

/** True when a stored identifier looks like a versioned salted hash, never a raw IP. */
export function isVersionedIpHash(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^v\d+:[a-f0-9]{64}$/i.test(value);
}

export function looksLikeRawIp(value: string): boolean {
  // IPv4 or simple IPv6
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  if (value.includes(":") && /^[0-9a-fA-F:]+$/.test(value)) return true;
  return false;
}
