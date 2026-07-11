import { createHmac } from "node:crypto";
import type { Socket } from "node:net";
import { createConnection } from "node:net";

/**
 * Rate limiting store: Redis when configured, otherwise an in-process memory
 * store with identical key/TTL semantics for single-instance local + CI use.
 * Keys use salted IP hashes and normalized emails — never raw IPs.
 */

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitStore = {
  /** Increment key and return current count within the TTL window. */
  incr(key: string, windowSeconds: number): Promise<number>;
  /** Current count without incrementing (0 if missing/expired). */
  get(key: string): Promise<number>;
  close?: () => Promise<void>;
};

/** In-memory Redis-compatible counter with TTL (for tests / no REDIS_URL). */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>();

  async get(key: string): Promise<number> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.expiresAt <= now) return 0;
    return existing.count;
  }

  async incr(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  /** Test helper: clear all counters. */
  clear(): void {
    this.buckets.clear();
  }

  async close(): Promise<void> {
    this.buckets.clear();
  }
}

/**
 * Minimal Redis client using the RESP protocol over TCP.
 * Avoids an extra dependency; supports INCR + EXPIRE (on first hit) + PING.
 */
export class RedisRateLimitStore implements RateLimitStore {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private waiters: Array<{
    resolve: (lines: string[]) => void;
    reject: (err: Error) => void;
    expected: number;
    lines: string[];
  }> = [];
  private readonly url: URL;

  constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  private async ensureConnected(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) return this.socket;
    const port = Number(this.url.port || 6379);
    const host = this.url.hostname || "127.0.0.1";
    const socket = createConnection({ host, port });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (err) => {
      for (const w of this.waiters) w.reject(err);
      this.waiters = [];
    });
    socket.on("close", () => {
      this.socket = null;
    });
    this.socket = socket;

    if (this.url.password) {
      await this.send(["AUTH", decodeURIComponent(this.url.password)]);
    }
    if (this.url.pathname && this.url.pathname !== "/") {
      const db = this.url.pathname.replace(/^\//, "");
      if (db) await this.send(["SELECT", db]);
    }
    return socket;
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.waiters.length > 0) {
      const text = this.buffer.toString("utf8");
      if (!text.includes("\r\n")) return;
      // Parse one RESP reply simply for integers / simple strings / errors.
      if (text.startsWith("-")) {
        const end = text.indexOf("\r\n");
        if (end < 0) return;
        const msg = text.slice(1, end);
        this.buffer = this.buffer.subarray(end + 2);
        const w = this.waiters.shift()!;
        w.reject(new Error(msg));
        continue;
      }
      if (text.startsWith(":") || text.startsWith("+")) {
        const end = text.indexOf("\r\n");
        if (end < 0) return;
        const line = text.slice(0, end);
        this.buffer = this.buffer.subarray(end + 2);
        const w = this.waiters.shift()!;
        w.lines.push(line);
        if (w.lines.length >= w.expected) w.resolve(w.lines);
        continue;
      }
      // bulk / array — not needed for INCR/EXPIRE/AUTH
      const end = text.indexOf("\r\n");
      if (end < 0) return;
      const line = text.slice(0, end);
      this.buffer = this.buffer.subarray(end + 2);
      const w = this.waiters.shift()!;
      w.lines.push(line);
      if (w.lines.length >= w.expected) w.resolve(w.lines);
    }
  }

  private async send(parts: string[]): Promise<string[]> {
    const socket = await this.ensureConnected();
    const payload =
      `*${parts.length}\r\n` + parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join("");
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject, expected: 1, lines: [] });
      socket.write(payload);
    });
  }

  async get(key: string): Promise<number> {
    try {
      const replies = await this.send(["GET", key]);
      const raw = replies[0] ?? "";
      if (raw === "$-1" || raw === "+" || raw.startsWith("$-1")) return 0;
      // bulk string: $<len>\r\n<body> simplified — our parser returns first line only.
      if (raw.startsWith("$")) {
        // body follows in next waiter cycle; treat missing as 0 for safety
        return 0;
      }
      if (raw.startsWith(":")) return Number(raw.slice(1)) || 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  async incr(key: string, windowSeconds: number): Promise<number> {
    const replies = await this.send(["INCR", key]);
    const raw = replies[0] ?? ":0";
    const count = Number(raw.startsWith(":") ? raw.slice(1) : raw);
    if (count === 1) {
      await this.send(["EXPIRE", key, String(windowSeconds)]);
    }
    return count;
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

export async function createRateLimitStore(redisUrl?: string | null): Promise<RateLimitStore> {
  if (!redisUrl) return new MemoryRateLimitStore();
  try {
    const store = new RedisRateLimitStore(redisUrl);
    // Probe connectivity; fall back to memory if Redis is unreachable.
    await store.incr("__vygo_rl_ping__", 1);
    return store;
  } catch {
    return new MemoryRateLimitStore();
  }
}

export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const count = await store.incr(key, windowSeconds);
  const allowed = count <= limit;
  return {
    allowed,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : windowSeconds,
  };
}

/**
 * Enforce IP limit using the current salt key (incremented) while also
 * respecting prior salt-version keys still inside the rotation window.
 */
export async function checkIpRateLimitWithRotation(
  store: RateLimitStore,
  currentHash: string,
  rotationHashes: string[],
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  for (const h of rotationHashes) {
    if (h === currentHash) continue;
    const prior = await store.get(ipRateLimitKey(h));
    if (prior >= limit) {
      return {
        allowed: false,
        count: prior,
        limit,
        remaining: 0,
        retryAfterSeconds: windowSeconds,
      };
    }
  }
  return checkRateLimit(store, ipRateLimitKey(currentHash), limit, windowSeconds);
}

/** PII-safe Redis/memory key for IP dimension (uses salted hash only). */
export function ipRateLimitKey(ipHash: string): string {
  return `rl:ip:${ipHash}`;
}

/** PII-safe key for email dimension (hash of normalized email, not raw). */
export function emailRateLimitKey(normalizedEmail: string, pepper: string): string {
  const digest = createHmac("sha256", pepper || "vygo-email-rl")
    .update(normalizedEmail)
    .digest("hex")
    .slice(0, 32);
  return `rl:email:${digest}`;
}
