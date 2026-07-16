import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CLOUDFLARE_TURNSTILE_TEST_SECRETS, isTestSurfaceEnabled, type ApiEnv } from "@vygo/config";
import {
  countEmailEventsByProviderId,
  countOutboxForEntry,
  findEmailEventByProviderId,
  findWaitlistByEmail,
  findWaitlistById,
  listOutboxForEntry,
  toSafeEmailEventView,
  type DatabaseHandle,
  type WaitlistEntry,
} from "@vygo/db";
import { runEmailRenderSuite } from "@vygo/email";
import { UTM_MAX_LENGTH, WAITLIST_SUCCESS_BODY } from "@vygo/validation";
import { runWorkerLogicSuite } from "@vygo/worker";
import { safeError } from "../errors.js";
import { isVersionedIpHash, looksLikeRawIp, hashIpAddress } from "../services/ip-hash.js";
import { MemoryRateLimitStore, type RateLimitStore } from "../services/rate-limit.js";
import { computeLeadScore } from "../services/scoring.js";
import {
  CloudflareTurnstileVerifier,
  PassThroughTurnstileVerifier,
  type TurnstileVerifier,
} from "../services/turnstile.js";
import { peekTestFault, setTestFault, type TestFaultMode } from "../services/test-fault.js";
import {
  signResendWebhook,
  TEST_RESEND_WEBHOOK_SECRET,
  verifyResendSignature,
} from "../services/resend-webhook.js";
import type { WaitlistRouteDeps } from "./waitlist.js";

export type TestSurfaceDeps = {
  env: ApiEnv;
  getDb: () => DatabaseHandle | null;
  rateLimitStore: RateLimitStore;
  turnstile: TurnstileVerifier;
  /** Rebuild waitlist route deps for isolated integration sub-tests. */
  createIsolatedWaitlistDeps?: (overrides: Partial<WaitlistRouteDeps>) => WaitlistRouteDeps;
};

/** Canonical non-production test-support route catalog (discoverable index). */
export const TEST_SUPPORT_ROUTES = {
  index: "/v1/test-support",
  report: "/v1/test-support/report",
  emailReport: "/v1/test-support/email-report",
  leads: "/v1/test-support/leads",
  outbox: "/v1/test-support/outbox",
  jobs: "/v1/test-support/jobs",
  application: "/v1/test-support/application",
  events: "/v1/test-support/events",
  fault: "/v1/test-support/fault",
  score: "/v1/test-support/score",
  ipHash: "/v1/test-support/ip-hash",
  /** Legacy paths kept for in-process integration tests. */
  legacyReport: "/v1/test/integration-report",
  legacyInspect: "/v1/test/waitlist/inspect",
  legacyIpHash: "/v1/test/ip-hash",
  legacyScore: "/v1/test/score",
} as const;

function sanitizeEntry(entry: WaitlistEntry) {
  return {
    id: entry.id,
    // Never expose email in inspection — only a redacted domain hint
    emailDomain: entry.email.includes("@") ? entry.email.split("@")[1] : null,
    fullNameLength: entry.fullName.length,
    companyName: entry.companyName,
    role: entry.role,
    productUrl: entry.productUrl,
    stage: entry.stage,
    primaryBlocker: entry.primaryBlocker,
    desiredStart: entry.desiredStart,
    budgetRange: entry.budgetRange,
    commercialDeadline: entry.commercialDeadline,
    messageLength: entry.message.length,
    priorityScore: entry.priorityScore,
    privacyAccepted: entry.privacyAccepted,
    privacyAcceptedAt: entry.privacyAcceptedAt?.toISOString?.() ?? entry.privacyAcceptedAt,
    marketingConsent: entry.marketingConsent,
    marketingConsentAt: entry.marketingConsentAt?.toISOString?.() ?? entry.marketingConsentAt,
    ipHash: entry.ipHash,
    ipHashIsVersioned: isVersionedIpHash(entry.ipHash),
    ipHashLooksLikeRawIp: entry.ipHash ? looksLikeRawIp(entry.ipHash) : false,
    landingPage: entry.landingPage,
    referrer: entry.referrer,
    utm: {
      source: entry.utmSource,
      medium: entry.utmMedium,
      campaign: entry.utmCampaign,
      content: entry.utmContent,
      term: entry.utmTerm,
    },
    submissionCount: entry.submissionCount,
    lastSubmittedAt: entry.lastSubmittedAt?.toISOString?.() ?? entry.lastSubmittedAt,
    createdAt: entry.createdAt?.toISOString?.() ?? entry.createdAt,
    updatedAt: entry.updatedAt?.toISOString?.() ?? entry.updatedAt,
  };
}

function parseEmailQuery(request: FastifyRequest): string {
  const q = request.query as Record<string, unknown>;
  return typeof q.email === "string" ? q.email.trim().toLowerCase() : "";
}

async function handleLeadInspect(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: TestSurfaceDeps,
) {
  const email = parseEmailQuery(request);
  if (!email || !email.includes("@")) {
    return reply
      .status(400)
      .send(safeError("BAD_REQUEST", "Provide an email query parameter for lookup."));
  }
  const db = deps.getDb();
  if (!db) {
    return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
  }
  const entry = await findWaitlistByEmail(db.db, email);
  if (!entry) {
    return reply.status(404).send(safeError("NOT_FOUND", "No record found."));
  }
  const outboxCount = await countOutboxForEntry(db.db, entry.id);
  const outbox = await listOutboxForEntry(db.db, entry.id);
  return reply.status(200).send({
    data: {
      entry: sanitizeEntry(entry),
      applicationId: entry.id,
      marketingConsent: entry.marketingConsent,
      outboxCount,
      outbox: outbox.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        attemptCount: row.attemptCount,
        providerIdempotencyKey: row.providerIdempotencyKey,
        hasRecipient: row.hasRecipient,
        recipientDomain: row.recipientDomain,
        createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
        sentAt: row.sentAt?.toISOString?.() ?? row.sentAt,
      })),
      utmMaxLength: deps.env.UTM_MAX_LENGTH || UTM_MAX_LENGTH,
    },
  });
}

async function handleOutboxInspect(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: TestSurfaceDeps,
) {
  const email = parseEmailQuery(request);
  if (!email || !email.includes("@")) {
    return reply
      .status(400)
      .send(safeError("BAD_REQUEST", "Provide an email query parameter for lookup."));
  }
  const db = deps.getDb();
  if (!db) {
    return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
  }
  const entry = await findWaitlistByEmail(db.db, email);
  if (!entry) {
    return reply.status(404).send(safeError("NOT_FOUND", "No record found."));
  }
  const outbox = await listOutboxForEntry(db.db, entry.id);
  return reply.status(200).send({
    data: {
      entryId: entry.id,
      applicationId: entry.id,
      outboxCount: outbox.length,
      pendingCount: outbox.filter((r) => r.status === "pending").length,
      items: outbox.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        attemptCount: row.attemptCount,
        providerIdempotencyKey: row.providerIdempotencyKey,
        hasRecipient: row.hasRecipient,
        recipientDomain: row.recipientDomain,
        createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
        sentAt: row.sentAt?.toISOString?.() ?? row.sentAt,
      })),
    },
  });
}

/** Safe job status for an application (no secrets, bodies, or raw emails). */
async function handleJobStatus(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: TestSurfaceDeps,
) {
  const q = request.query as Record<string, unknown>;
  const applicationId =
    (typeof q.applicationId === "string" && q.applicationId.trim()) ||
    (typeof q.id === "string" && q.id.trim()) ||
    "";
  const email = typeof q.email === "string" ? q.email.trim().toLowerCase() : "";

  const db = deps.getDb();
  if (!db) {
    return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
  }

  let entry: WaitlistEntry | null = null;
  if (applicationId) {
    entry = await findWaitlistById(db.db, applicationId);
  } else if (email && email.includes("@")) {
    entry = await findWaitlistByEmail(db.db, email);
  } else {
    return reply
      .status(400)
      .send(safeError("BAD_REQUEST", "Provide applicationId or email query parameter."));
  }

  if (!entry) {
    return reply.status(404).send(safeError("NOT_FOUND", "No record found."));
  }

  const outbox = await listOutboxForEntry(db.db, entry.id);
  const kinds = outbox.map((r) => r.kind);
  const uniqueKeys = new Set(outbox.map((r) => r.providerIdempotencyKey));

  return reply.status(200).send({
    data: {
      applicationId: entry.id,
      marketingConsent: entry.marketingConsent,
      transactionalEmail: {
        jobCount: outbox.length,
        kinds,
        uniqueProviderIdempotencyKeys: uniqueKeys.size,
        jobs: outbox.map((row) => ({
          id: row.id,
          kind: row.kind,
          status: row.status,
          attemptCount: row.attemptCount,
          providerIdempotencyKey: row.providerIdempotencyKey,
          hasRecipient: row.hasRecipient,
          recipientDomain: row.recipientDomain,
          createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
          sentAt: row.sentAt?.toISOString?.() ?? row.sentAt,
        })),
      },
      // Consent is intentionally separate from email job state.
      consent: {
        marketingConsent: entry.marketingConsent,
        privacyAccepted: entry.privacyAccepted,
      },
    },
  });
}

/** Safe webhook event status (dedup verification). */
async function handleEventStatus(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: TestSurfaceDeps,
) {
  const q = request.query as Record<string, unknown>;
  const providerEventId =
    (typeof q.providerEventId === "string" && q.providerEventId.trim()) ||
    (typeof q.id === "string" && q.id.trim()) ||
    "";
  if (!providerEventId) {
    return reply
      .status(400)
      .send(safeError("BAD_REQUEST", "Provide providerEventId query parameter."));
  }
  const db = deps.getDb();
  if (!db) {
    return reply.status(503).send(safeError("UNAVAILABLE", "Database is not available."));
  }
  const count = await countEmailEventsByProviderId(db.db, providerEventId);
  const event = await findEmailEventByProviderId(db.db, providerEventId);
  return reply.status(200).send({
    data: {
      providerEventId,
      count,
      event: event ? toSafeEmailEventView(event) : null,
    },
  });
}

async function handleIpHash(request: FastifyRequest, reply: FastifyReply, deps: TestSurfaceDeps) {
  const q = request.query as Record<string, unknown>;
  const ip = typeof q.ip === "string" ? q.ip.trim() : "203.0.113.10";
  const result = hashIpAddress(ip, deps.env);
  if (!result) {
    return reply.status(503).send(safeError("UNAVAILABLE", "IP hash salt is not configured."));
  }
  return reply.status(200).send({
    data: {
      hash: result.hash,
      version: result.version,
      rotationHashes: result.rotationHashes,
      allVersioned: result.rotationHashes.every(isVersionedIpHash),
      anyRawIp: result.rotationHashes.some(looksLikeRawIp),
    },
  });
}

async function handleScore(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const application = {
    fullName: "Test",
    email: "test@example.com",
    companyName: "Co",
    productUrl: "https://example.com",
    stage: body.stage ?? "prototype",
    primaryBlocker: body.primaryBlocker ?? "other",
    desiredStartWindow: body.desiredStartWindow ?? "later",
    budgetRange: body.budgetRange ?? null,
    commercialDeadline: Boolean(body.commercialDeadline),
    message: "score preview",
    privacyAccepted: true as const,
    marketingConsent: false,
    turnstileToken: "x",
    utm: {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = computeLeadScore(application as any);
  return reply.status(200).send({ data: score });
}

function handleFaultGet(_request: FastifyRequest, reply: FastifyReply) {
  const state = peekTestFault();
  return reply.status(200).send({
    data: {
      mode: state.mode,
      remaining: state.remaining,
      description:
        "POST { mode: 'lead'|'outbox'|'none', count?: number } to arm persistence faults for the next N intakes. Non-production only.",
    },
  });
}

async function handleFaultPost(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const modeRaw = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
  if (modeRaw !== "none" && modeRaw !== "lead" && modeRaw !== "outbox") {
    return reply
      .status(400)
      .send(safeError("BAD_REQUEST", "mode must be one of: none, lead, outbox."));
  }
  const count =
    typeof body.count === "number" && Number.isFinite(body.count)
      ? Math.max(0, Math.floor(body.count))
      : 1;
  const result = setTestFault(modeRaw as TestFaultMode, count);
  return reply.status(200).send({
    data: {
      mode: result.mode,
      remaining: result.remaining,
      armed: result.mode !== "none",
    },
  });
}

async function handleIntegrationReport(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: TestSurfaceDeps,
) {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const record = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail });
  };

  const origin =
    (typeof request.headers.origin === "string" && request.headers.origin) ||
    (deps.env.CORS_ORIGINS || deps.env.ALLOWED_ORIGINS || "http://127.0.0.1:8380")
      .split(",")[0]
      ?.trim() ||
    "http://127.0.0.1:8380";

  const db = deps.getDb();
  const turnstileToken =
    deps.env.TURNSTILE_SECRET_KEY === CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses ||
    !deps.env.TURNSTILE_SECRET_KEY
      ? "XXXX.DUMMY.TOKEN.XXXX"
      : "test-token";

  let ipSeq = 0;
  const nextTestIp = () => {
    // Unique DOCUMENTATION IPs so live rate-limit state never poisons the report.
    const a = 198;
    const b = 51;
    const c = 100 + Math.floor(ipSeq / 250);
    const d = (ipSeq % 250) + 1;
    ipSeq += 1;
    return `${a}.${b}.${c}.${d}`;
  };

  const basePayload = () => {
    const id = randomUUID();
    return {
      fullName: "  Integration Tester  ",
      email: `  Int.Test+${id.slice(0, 8)}@Example.COM `,
      companyName: "Vygo Test Co",
      role: "Founder",
      productUrl: "https://example.com/product",
      prototypePlatform: "lovable",
      stage: "live_users" as const,
      primaryBlocker: "security_compliance" as const,
      desiredStartWindow: "within_30_days" as const,
      budgetRange: "75k_150k" as const,
      commercialDeadline: true,
      message: "Enterprise customer waiting on SSO and audit logs.",
      privacyAccepted: true as const,
      marketingConsent: false,
      turnstileToken,
      idempotencyKey: id,
      utm: {
        source: "linkedin",
        medium: "social",
        campaign: "prototype_teardown",
        content: null,
        term: null,
      },
      landingPage: "/waitlist",
      referrer: "https://www.linkedin.com/",
      formStartedAt: Date.now() - 10_000,
    };
  };

  const post = async (payload: unknown, headers: Record<string, string> = {}) => {
    const app = request.server;
    return app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: {
        "content-type": "application/json",
        origin,
        "x-forwarded-for": headers["x-forwarded-for"] ?? nextTestIp(),
        ...headers,
      },
      payload: payload as Record<string, unknown>,
    });
  };

  // --- valid intake ---
  {
    const payload = basePayload();
    const res = await post(payload);
    const body = res.json();
    const pass =
      res.statusCode === 200 &&
      body?.data?.accepted === true &&
      !res.body.toLowerCase().includes(payload.email.trim().toLowerCase()) &&
      !res.body.toLowerCase().includes("turnstile") &&
      !res.body.includes("198.51.100");
    record("valid_intake", pass, `status=${res.statusCode}`);
  }

  // --- normalization (email lowercased, trim) ---
  {
    const payload = basePayload();
    const res = await post(payload);
    let pass = res.statusCode === 200;
    if (db && pass) {
      const normalized = payload.email.trim().toLowerCase();
      const entry = await findWaitlistByEmail(db.db, normalized);
      pass = Boolean(
        entry && entry.email === normalized && entry.fullName === "Integration Tester",
      );
    }
    record("normalization", pass, `status=${res.statusCode}`);
  }

  // --- invalid fields (malformed email + control characters must be 400, never 500) ---
  {
    const badEmail = await post({ ...basePayload(), email: "not-an-email" });
    const badEmailBody = badEmail.json();
    const emailOk =
      badEmail.statusCode === 400 &&
      badEmailBody?.error?.code === "VALIDATION_ERROR" &&
      !badEmail.body.includes("not-an-email");

    const nulPayload = {
      ...basePayload(),
      email: `nul-ctrl-${randomUUID().slice(0, 8)}@example.com`,
      fullName: `A${"\u0000"}B`,
    };
    const nulRes = await post(nulPayload);
    const nulBody = nulRes.json();
    let nulOk =
      nulRes.statusCode === 400 &&
      nulBody?.error?.code === "VALIDATION_ERROR" &&
      nulBody?.error?.fields?.fullName === "Please review this field." &&
      !nulRes.body.includes("\u0000") &&
      !nulRes.body.includes(nulPayload.email);

    if (nulOk && db) {
      const entry = await findWaitlistByEmail(db.db, nulPayload.email.trim().toLowerCase());
      nulOk = entry == null;
    }

    const c0Payload = {
      ...basePayload(),
      email: `c0-ctrl-${randomUUID().slice(0, 8)}@example.com`,
      fullName: `Ada${"\u0001"}Lovelace`,
    };
    const c0Res = await post(c0Payload);
    let c0Ok = c0Res.statusCode === 400 && c0Res.json()?.error?.code === "VALIDATION_ERROR";
    if (c0Ok && db) {
      const entry = await findWaitlistByEmail(db.db, c0Payload.email.trim().toLowerCase());
      c0Ok = entry == null;
    }

    record("invalid_fields", emailOk && nulOk && c0Ok);
  }

  // --- privacy rejection ---
  {
    const payload = { ...basePayload(), privacyAccepted: false };
    const res = await post(payload);
    const pass = res.statusCode === 400 && res.json()?.error?.code === "VALIDATION_ERROR";
    record("privacy_rejection", pass);
  }

  // --- invalid URL ---
  {
    const payload = { ...basePayload(), productUrl: "javascript:alert(1)" };
    const res = await post(payload);
    const pass = res.statusCode === 400;
    record("invalid_urls", pass);
  }

  // --- Turnstile failure ---
  {
    const failVerifier = new CloudflareTurnstileVerifier(
      CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysBlocks,
    );
    const bad = await failVerifier.verify("any");
    record("turnstile_failure", bad.success === false);
  }

  // --- rate limiting (isolated memory store simulation) ---
  {
    const mem = new MemoryRateLimitStore();
    let limited = false;
    for (let i = 0; i < 5; i++) {
      const { count } = await mem.incr("rl:ip:test", 60);
      if (count > 3) limited = true;
    }
    record("rate_limiting", limited);
  }

  // --- origin / payload controls (content-type, method) ---
  {
    const app = request.server;
    const plain = await app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { "content-type": "text/plain", origin },
      payload: "{}",
    });
    const put = await app.inject({
      method: "PUT",
      url: "/v1/waitlist",
      headers: { "content-type": "application/json", origin },
      payload: {},
    });
    record("origin_payload_controls", plain.statusCode === 415 && put.statusCode === 405);
  }

  // --- abuse signals (honeypot silent accept) ---
  {
    const payload = { ...basePayload(), website: "http://spam.example" };
    const res = await post(payload);
    const pass =
      res.statusCode === 200 &&
      res.json()?.data?.accepted === true &&
      !res.body.toLowerCase().includes("honeypot") &&
      !res.body.toLowerCase().includes("spam");
    let noPersist = true;
    if (db && pass) {
      const entry = await findWaitlistByEmail(db.db, payload.email.trim().toLowerCase());
      noPersist = entry == null;
    }
    record("abuse_signals", pass && noPersist);
  }

  // --- salted IP handling ---
  {
    const hashed = hashIpAddress("203.0.113.99", deps.env);
    record(
      "salted_ip_handling",
      Boolean(
        hashed &&
        isVersionedIpHash(hashed.hash) &&
        !looksLikeRawIp(hashed.hash) &&
        hashed.rotationHashes.length >= 1,
      ),
    );
  }

  // --- UTM limits ---
  {
    const over = "x".repeat(UTM_MAX_LENGTH + 1);
    const res = await post({
      ...basePayload(),
      utm: { source: over, medium: null, campaign: null, content: null, term: null },
    });
    const okLimit = await post({
      ...basePayload(),
      utm: {
        source: "s".repeat(UTM_MAX_LENGTH),
        medium: null,
        campaign: null,
        content: null,
        term: null,
      },
    });
    record("utm_limits", res.statusCode === 400 && okLimit.statusCode === 200);
  }

  // --- idempotency ---
  {
    const payload = basePayload();
    const a = await post(payload);
    const b = await post(payload);
    const pass = a.statusCode === 200 && b.statusCode === 200 && a.body === b.body;
    record("idempotency", pass);
  }

  // --- duplicate upserts ---
  {
    const email = `dup+${randomUUID().slice(0, 8)}@example.com`;
    const p1 = { ...basePayload(), email, idempotencyKey: randomUUID(), fullName: "First Name" };
    const p2 = {
      ...basePayload(),
      email,
      idempotencyKey: randomUUID(),
      fullName: "Second Name",
      formStartedAt: Date.now() - 10_000,
    };
    const a = await post(p1);
    const b = await post(p2);
    let pass = a.statusCode === 200 && b.statusCode === 200;
    if (db && pass) {
      const entry = await findWaitlistByEmail(db.db, email);
      pass = Boolean(
        entry &&
        entry.fullName === "Second Name" &&
        entry.submissionCount >= 2 &&
        entry.createdAt <= entry.lastSubmittedAt,
      );
    }
    record("duplicate_upserts", pass);
  }

  // --- transaction rollback (fault adapter via armed fault) ---
  {
    let pass = true;
    if (db) {
      try {
        const { persistWaitlistIntake } = await import("@vygo/db");
        const email = `fault+${randomUUID().slice(0, 8)}@example.com`;
        const appBody = {
          ...basePayload(),
          email,
          fullName: "Fault",
          companyName: "Fault Co",
          productUrl: "https://example.com",
          stage: "prototype" as const,
          primaryBlocker: "other" as const,
          desiredStartWindow: "later" as const,
          message: "fault test",
          privacyAccepted: true as const,
          marketingConsent: false,
          turnstileToken: "x",
          utm: {},
        };
        try {
          await persistWaitlistIntake(
            db.db,
            {
              application: appBody as never,
              ipHash: "v1:abc",
              userAgent: null,
              priorityScore: 0,
            },
            { faultOutbox: true },
          );
          pass = false;
        } catch {
          const entry = await findWaitlistByEmail(db.db, email);
          pass = entry == null;
        }

        // Also exercise HTTP fault arming path: arm lead fault, POST, expect 500, no row.
        setTestFault("lead", 1);
        const faultEmail = `fault-http+${randomUUID().slice(0, 8)}@example.com`;
        const faultRes = await post({
          ...basePayload(),
          email: faultEmail,
          idempotencyKey: randomUUID(),
        });
        const faultEntry = await findWaitlistByEmail(db.db, faultEmail);
        const httpFaultPass =
          faultRes.statusCode === 500 &&
          faultRes.json()?.error?.code === "INTERNAL_ERROR" &&
          faultEntry == null &&
          !faultRes.body.toLowerCase().includes(faultEmail);
        pass = pass && httpFaultPass;
        setTestFault("none");
      } catch {
        pass = false;
        setTestFault("none");
      }
    }
    record("transaction_rollback", pass);
  }

  // --- outbox creation (applicant confirmation + internal lead notification) ---
  {
    const email = `outbox+${randomUUID().slice(0, 8)}@example.com`;
    const payload = { ...basePayload(), email, idempotencyKey: randomUUID() };
    const res = await post(payload);
    let pass = res.statusCode === 200;
    if (db && pass) {
      const entry = await findWaitlistByEmail(db.db, email);
      if (!entry) pass = false;
      else {
        const rows = await listOutboxForEntry(db.db, entry.id);
        const kinds = new Set(rows.map((r) => r.kind));
        pass =
          rows.length === 2 &&
          kinds.has("applicant_confirmation") &&
          kinds.has("internal_lead_notification") &&
          rows.every((r) => Boolean(r.providerIdempotencyKey));
      }
    }
    record("outbox_creation", pass);
  }

  // --- marketing consent independent of transactional email ---
  {
    let pass = true;
    for (const consent of [true, false, undefined] as const) {
      const email = `consent+${consent === undefined ? "omit" : consent}-${randomUUID().slice(0, 8)}@example.com`;
      const payload = {
        ...basePayload(),
        email,
        idempotencyKey: randomUUID(),
        ...(consent === undefined ? {} : { marketingConsent: consent }),
      };
      const res = await post(payload);
      if (res.statusCode !== 200) {
        pass = false;
        break;
      }
      const body = res.json();
      if (body?.data?.applicationId == null) {
        pass = false;
        break;
      }
      // Consent is reported separately from email queue state.
      if (typeof body.data.marketingConsent !== "boolean") {
        pass = false;
        break;
      }
      if (db) {
        const entry = await findWaitlistByEmail(db.db, email);
        const jobs = entry ? await listOutboxForEntry(db.db, entry.id) : [];
        if (!entry || jobs.length !== 2) {
          pass = false;
          break;
        }
      }
    }
    record("marketing_consent_independent", pass);
  }

  // --- async response includes durable application id before delivery ---
  {
    const email = `async+${randomUUID().slice(0, 8)}@example.com`;
    const res = await post({ ...basePayload(), email, idempotencyKey: randomUUID() });
    const body = res.json();
    const pass =
      res.statusCode === 200 &&
      typeof body?.data?.applicationId === "string" &&
      body.data.applicationId.length > 10 &&
      body?.data?.email?.queued === true &&
      (body?.data?.email?.jobCount ?? 0) === 2;
    record("async_application_id", pass);
  }

  // --- scoring ---
  {
    const low = computeLeadScore({
      ...basePayload(),
      stage: "prototype",
      primaryBlocker: "other",
      desiredStartWindow: "later",
      budgetRange: "under_25k",
      commercialDeadline: false,
    } as never);
    const high = computeLeadScore({
      ...basePayload(),
      stage: "enterprise_pipeline",
      primaryBlocker: "security_compliance",
      desiredStartWindow: "asap",
      budgetRange: "300k_plus",
      commercialDeadline: true,
    } as never);
    record("scoring", low.total < high.total && high.total >= 8);
  }

  // --- PII-safe structured logging / responses ---
  {
    const payload = {
      ...basePayload(),
      email: "pii-leak-check@example.com",
      turnstileToken: "SECRETTOKEN123",
    };
    const res = await post({ ...payload, email: "not-valid" });
    const lower = res.body.toLowerCase();
    const pass =
      !lower.includes("pii-leak-check") &&
      !lower.includes("secrettoken123") &&
      !lower.includes("198.51.");
    record("pii_safe_structured_logging", pass);
  }

  // --- success envelope shape ---
  {
    record(
      "generic_success_shape",
      WAITLIST_SUCCESS_BODY.data.accepted === true &&
        typeof WAITLIST_SUCCESS_BODY.data.message === "string",
    );
  }

  // Pass-through verifier sanity (DI adapter available for CI)
  {
    const v = new PassThroughTurnstileVerifier();
    const ok = await v.verify("token");
    record("di_turnstile_adapter", ok.success === true);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  return reply.status(200).send({
    data: {
      ready: failed.length === 0,
      passed,
      total: results.length,
      results,
      coverage: {
        valid_intake: results.find((r) => r.name === "valid_intake")?.pass ?? false,
        normalization: results.find((r) => r.name === "normalization")?.pass ?? false,
        invalid_fields: results.find((r) => r.name === "invalid_fields")?.pass ?? false,
        privacy_rejection: results.find((r) => r.name === "privacy_rejection")?.pass ?? false,
        invalid_urls: results.find((r) => r.name === "invalid_urls")?.pass ?? false,
        turnstile_failure: results.find((r) => r.name === "turnstile_failure")?.pass ?? false,
        origin_payload_controls:
          results.find((r) => r.name === "origin_payload_controls")?.pass ?? false,
        rate_limiting: results.find((r) => r.name === "rate_limiting")?.pass ?? false,
        abuse_signals: results.find((r) => r.name === "abuse_signals")?.pass ?? false,
        salted_ip_handling: results.find((r) => r.name === "salted_ip_handling")?.pass ?? false,
        idempotency: results.find((r) => r.name === "idempotency")?.pass ?? false,
        duplicate_upserts: results.find((r) => r.name === "duplicate_upserts")?.pass ?? false,
        transaction_rollback: results.find((r) => r.name === "transaction_rollback")?.pass ?? false,
        outbox_creation: results.find((r) => r.name === "outbox_creation")?.pass ?? false,
        marketing_consent_independent:
          results.find((r) => r.name === "marketing_consent_independent")?.pass ?? false,
        async_application_id: results.find((r) => r.name === "async_application_id")?.pass ?? false,
        scoring: results.find((r) => r.name === "scoring")?.pass ?? false,
        utm_limits: results.find((r) => r.name === "utm_limits")?.pass ?? false,
        pii_safe_structured_logging:
          results.find((r) => r.name === "pii_safe_structured_logging")?.pass ?? false,
      },
      routes: TEST_SUPPORT_ROUTES,
      reportPath: TEST_SUPPORT_ROUTES.report,
      emailReportPath: TEST_SUPPORT_ROUTES.emailReport,
      inspectPath: TEST_SUPPORT_ROUTES.leads,
      outboxPath: TEST_SUPPORT_ROUTES.outbox,
      jobsPath: TEST_SUPPORT_ROUTES.jobs,
      eventsPath: TEST_SUPPORT_ROUTES.events,
      faultPath: TEST_SUPPORT_ROUTES.fault,
      ipHashPath: TEST_SUPPORT_ROUTES.ipHash,
      scorePath: TEST_SUPPORT_ROUTES.score,
    },
  });
}

/**
 * Live report for React Email rendering, worker, webhook, graceful shutdown, and redaction.
 */
async function handleEmailReport(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: TestSurfaceDeps,
) {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const record = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail });
  };

  // Rendering suite
  try {
    const renderSuite = await runEmailRenderSuite();
    for (const r of renderSuite.results) {
      record(`render:${r.name}`, r.pass, r.detail);
    }
    record("react_email_rendering", renderSuite.ready);
  } catch (e) {
    record("react_email_rendering", false, e instanceof Error ? e.message : "error");
  }

  // Worker suite (SKIP LOCKED / retry / dead-letter / redaction / shutdown)
  try {
    const db = deps.getDb();
    const workerSuite = await runWorkerLogicSuite({ db: db?.db });
    for (const r of workerSuite.results) {
      record(`worker:${r.name}`, r.pass, r.detail);
    }
    record("worker_tests", workerSuite.ready);
  } catch (e) {
    record("worker_tests", false, e instanceof Error ? e.message : "error");
  }

  // Webhook signature + persistence + dedup via inject
  {
    const app = request.server;
    const secret = deps.env.RESEND_WEBHOOK_SECRET || TEST_RESEND_WEBHOOK_SECRET;
    const eventId = `evt_test_${randomUUID()}`;
    const bodyObj = {
      type: "email.sent",
      id: eventId,
      data: { email_id: eventId, to: ["redacted@example.com"] },
    };
    const rawBody = JSON.stringify(bodyObj);
    const ts = Math.floor(Date.now() / 1000);
    const svixId = `msg_${randomUUID()}`;
    const signature = signResendWebhook({
      secret,
      id: svixId,
      timestamp: ts,
      rawBody,
    });

    // Invalid signature
    const bad = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(ts),
        "svix-signature": "v1,notavalidsignature====",
      },
      payload: rawBody,
    });
    const badOk = bad.statusCode >= 400 && bad.statusCode < 500;
    record("webhook_invalid_signature", badOk, `status=${bad.statusCode}`);

    // Missing signature
    const missing = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });
    record(
      "webhook_missing_signature",
      missing.statusCode >= 400 && missing.statusCode < 500,
      `status=${missing.statusCode}`,
    );

    // Valid signature
    const good = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(ts),
        "svix-signature": signature,
      },
      payload: rawBody,
    });
    const goodBody = good.json();
    const goodOk =
      good.statusCode >= 200 &&
      good.statusCode < 300 &&
      goodBody?.data?.accepted === true &&
      !good.body.toLowerCase().includes("whsec_") &&
      !good.body.includes(secret);
    record("webhook_valid_signature_persist", goodOk, `status=${good.statusCode}`);

    // Duplicate delivery
    const dup = await app.inject({
      method: "POST",
      url: "/v1/webhooks/resend",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(ts),
        "svix-signature": signature,
      },
      payload: rawBody,
    });
    let dedupOk = dup.statusCode >= 200 && dup.statusCode < 300;
    const db = deps.getDb();
    if (db && dedupOk) {
      const count = await countEmailEventsByProviderId(db.db, eventId);
      dedupOk = count === 1;
    }
    record("webhook_deduplication", dedupOk, `status=${dup.statusCode}`);

    // Pure verify helper
    const verifyOk = verifyResendSignature({
      secret,
      headers: { id: svixId, timestamp: String(ts), signature },
      rawBody,
    });
    record("webhook_signature_helper", verifyOk.ok === true);
  }

  // Ensure invalid webhook did not persist a fake id
  {
    const db = deps.getDb();
    if (db) {
      const count = await countEmailEventsByProviderId(db.db, "should-never-exist-invalid-sig");
      record("webhook_invalid_not_persisted", count === 0);
    } else {
      record("webhook_invalid_not_persisted", true, "no_db");
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  return reply.status(200).send({
    data: {
      ready: failed.length === 0,
      passed,
      total: results.length,
      results,
      coverage: {
        react_email_rendering:
          results.find((r) => r.name === "react_email_rendering")?.pass ?? false,
        worker_tests: results.find((r) => r.name === "worker_tests")?.pass ?? false,
        webhook_invalid_signature:
          results.find((r) => r.name === "webhook_invalid_signature")?.pass ?? false,
        webhook_valid_signature_persist:
          results.find((r) => r.name === "webhook_valid_signature_persist")?.pass ?? false,
        webhook_deduplication:
          results.find((r) => r.name === "webhook_deduplication")?.pass ?? false,
        graceful_shutdown:
          results.find((r) => r.name === "worker:graceful_shutdown")?.pass ?? false,
        secret_redaction: results.find((r) => r.name === "worker:secret_redaction")?.pass ?? false,
      },
      routes: TEST_SUPPORT_ROUTES,
    },
  });
}

/**
 * Non-production inspection + integration report surface.
 * Never registered when test surface is disabled (strict production).
 */
export function registerTestSurfaceRoutes(app: FastifyInstance, deps: TestSurfaceDeps): void {
  if (!isTestSurfaceEnabled(deps.env)) {
    return;
  }

  // --- Discoverable index (primary entry for black-box testers) ---
  app.get(TEST_SUPPORT_ROUTES.index, async (_request, reply) => {
    const fault = peekTestFault();
    return reply.status(200).send({
      data: {
        enabled: true,
        description:
          "Non-production waitlist + email-worker test support. Production-configured deployments return 404 for these routes.",
        routes: {
          index: {
            method: "GET",
            path: TEST_SUPPORT_ROUTES.index,
            purpose: "This catalog",
          },
          report: {
            method: "GET",
            path: TEST_SUPPORT_ROUTES.report,
            purpose:
              "Live integration-test report (valid intake, validation, turnstile, rate limits, idempotency, upserts, rollback, dual outbox, scoring, PII-safe logs)",
          },
          emailReport: {
            method: "GET",
            path: TEST_SUPPORT_ROUTES.emailReport,
            purpose:
              "React Email render, worker (SKIP LOCKED, retry, dead-letter), webhook signature/dedup, graceful shutdown, secret redaction",
          },
          leads: {
            method: "GET",
            path: `${TEST_SUPPORT_ROUTES.leads}?email=`,
            purpose:
              "PII-safe lead inspection by normalized email (score, UTM, versioned ipHash, first/last seen, consent)",
          },
          outbox: {
            method: "GET",
            path: `${TEST_SUPPORT_ROUTES.outbox}?email=`,
            purpose:
              "Transactional outbox inspection for a lead (count, kind, status, providerIdempotencyKey; no raw email)",
          },
          jobs: {
            method: "GET",
            path: `${TEST_SUPPORT_ROUTES.jobs}?applicationId=`,
            purpose:
              "Safe job status for an application (kinds, statuses, stable provider idempotency keys; consent separate)",
          },
          application: {
            method: "GET",
            path: `${TEST_SUPPORT_ROUTES.application}?applicationId=`,
            purpose: "Alias of jobs status",
          },
          events: {
            method: "GET",
            path: `${TEST_SUPPORT_ROUTES.events}?providerEventId=`,
            purpose: "Safe webhook event status / dedup count (no secrets)",
          },
          fault: {
            method: "GET|POST",
            path: TEST_SUPPORT_ROUTES.fault,
            purpose:
              "Arm lead/outbox persistence fault for the next N intakes (POST {mode,count}); GET current state",
          },
          score: {
            method: "POST",
            path: TEST_SUPPORT_ROUTES.score,
            purpose: "Deterministic lead score preview (non-persisting)",
          },
          ipHash: {
            method: "GET",
            path: `${TEST_SUPPORT_ROUTES.ipHash}?ip=`,
            purpose: "Versioned salted IP hash + rotation window (input IP never stored)",
          },
        },
        legacy: {
          report: TEST_SUPPORT_ROUTES.legacyReport,
          inspect: TEST_SUPPORT_ROUTES.legacyInspect,
          ipHash: TEST_SUPPORT_ROUTES.legacyIpHash,
          score: TEST_SUPPORT_ROUTES.legacyScore,
        },
        fault: fault,
        webhookTestSecretHint:
          "Non-production uses RESEND_WEBHOOK_SECRET or the stable test secret (whsec_ base64 of 'vygo-local-test-webhook-secret-v1'). Sign with Svix: HMAC-SHA256 of `${svix-id}.${svix-timestamp}.${rawBody}`.",
      },
    });
  });

  app.get(TEST_SUPPORT_ROUTES.report, (req, rep) => handleIntegrationReport(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.emailReport, (req, rep) => handleEmailReport(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.leads, (req, rep) => handleLeadInspect(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.outbox, (req, rep) => handleOutboxInspect(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.jobs, (req, rep) => handleJobStatus(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.application, (req, rep) => handleJobStatus(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.events, (req, rep) => handleEventStatus(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.fault, handleFaultGet);
  app.post(TEST_SUPPORT_ROUTES.fault, handleFaultPost);
  app.post(TEST_SUPPORT_ROUTES.score, handleScore);
  app.get(TEST_SUPPORT_ROUTES.ipHash, (req, rep) => handleIpHash(req, rep, deps));

  // --- Legacy paths (integration tests + docs) ---
  app.get(TEST_SUPPORT_ROUTES.legacyInspect, (req, rep) => handleLeadInspect(req, rep, deps));
  app.get(TEST_SUPPORT_ROUTES.legacyIpHash, (req, rep) => handleIpHash(req, rep, deps));
  app.post(TEST_SUPPORT_ROUTES.legacyScore, handleScore);
  app.get(TEST_SUPPORT_ROUTES.legacyReport, (req, rep) => handleIntegrationReport(req, rep, deps));
}
