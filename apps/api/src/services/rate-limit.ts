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
  /** Seconds until the window resets (0 when allowed). Prefer remaining TTL. */
  retryAfterSeconds: number;
};

export type RateLimitIncrResult = {
  count: number;
  /** Remaining TTL in seconds for the key (>= 1 when known, else windowSeconds). */
  ttlSeconds: number;
};

export type RateLimitStore = {
  /** Increment key and return current count + remaining TTL within the window. */
  incr(key: string, windowSeconds: number): Promise<RateLimitIncrResult>;
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

  async incr(key: string, windowSeconds: number): Promise<RateLimitIncrResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return { count: 1, ttlSeconds: windowSeconds };
    }
    existing.count += 1;
    const ttlSeconds = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
    return { count: existing.count, ttlSeconds };
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
 * Avoids an extra dependency; supports INCR + EXPIRE + TTL + PING.
 * Commands are serialized through a single queue so concurrent requests cannot
 * interleave RESP replies (which previously could poison counts / TTLs).
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
  /** Serialize all Redis commands on this connection. */
  private chain: Promise<unknown> = Promise.resolve();

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
      await this.sendUnlocked(["AUTH", decodeURIComponent(this.url.password)]);
    }
    if (this.url.pathname && this.url.pathname !== "/") {
      const db = this.url.pathname.replace(/^\//, "");
      if (db) await this.sendUnlocked(["SELECT", db]);
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
      // bulk / array — not needed for INCR/EXPIRE/AUTH/TTL integers
      const end = text.indexOf("\r\n");
      if (end < 0) return;
      const line = text.slice(0, end);
      this.buffer = this.buffer.subarray(end + 2);
      const w = this.waiters.shift()!;
      w.lines.push(line);
      if (w.lines.length >= w.expected) w.resolve(w.lines);
    }
  }

  private async sendUnlocked(parts: string[]): Promise<string[]> {
    const socket = await this.ensureConnected();
    const payload =
      `*${parts.length}\r\n` + parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join("");
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject, expected: 1, lines: [] });
      socket.write(payload);
    });
  }

  /** Public send: serialized so concurrent handlers never interleave RESP. */
  private send(parts: string[]): Promise<string[]> {
    const run = this.chain.then(() => this.sendUnlocked(parts));
    // Keep the chain alive even when a command fails.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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

  async incr(key: string, windowSeconds: number): Promise<RateLimitIncrResult> {
    const replies = await this.send(["INCR", key]);
    const raw = replies[0] ?? ":0";
    const count = Number(raw.startsWith(":") ? raw.slice(1) : raw);

    // Always ensure a finite, short TTL. Never leave counters without expiry, and
    // never leave a legacy multi-hour TTL that blocks resume for an hour.
    let ttlSeconds = windowSeconds;
    try {
      if (count === 1) {
        await this.send(["EXPIRE", key, String(windowSeconds)]);
        ttlSeconds = windowSeconds;
      } else {
        const ttlReplies = await this.send(["TTL", key]);
        const ttlRaw = ttlReplies[0] ?? ":-2";
        const ttl = Number(ttlRaw.startsWith(":") ? ttlRaw.slice(1) : ttlRaw);
        if (!Number.isFinite(ttl) || ttl < 0) {
          // -1 = no expiry, -2 = missing (race). Repair to the current window.
          await this.send(["EXPIRE", key, String(windowSeconds)]);
          ttlSeconds = windowSeconds;
        } else if (ttl > windowSeconds) {
          // Cap residual long lockouts (e.g. prior 3600s windows) to the new window.
          await this.send(["EXPIRE", key, String(windowSeconds)]);
          ttlSeconds = windowSeconds;
        } else {
          ttlSeconds = Math.max(1, ttl);
        }
      }
    } catch {
      try {
        await this.send(["EXPIRE", key, String(windowSeconds)]);
      } catch {
        // best-effort; next request will retry repair
      }
      ttlSeconds = windowSeconds;
    }

    return {
      count: Number.isFinite(count) ? count : 0,
      ttlSeconds,
    };
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
  const { count, ttlSeconds } = await store.incr(key, windowSeconds);
  const allowed = count <= limit;
  return {
    allowed,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    // Prefer remaining key TTL so clients are not told to wait a full hour
    // after a short window (or a residual long-TTL key we just capped).
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.min(ttlSeconds || windowSeconds, windowSeconds)),
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
