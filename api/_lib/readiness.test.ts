import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidReadinessToken, proxyToken, proxySubmit, proxyGetStatus } from "./readiness.js";
import handler from "../readiness/[op].js";
import type { EdgeRequest, EdgeResponse } from "./http.js";

describe("edge readiness token validation", () => {
  it("validates high-entropy token formats", () => {
    assert.equal(isValidReadinessToken("some-valid-token-string"), true);
    assert.equal(isValidReadinessToken(""), false);
    assert.equal(isValidReadinessToken("short"), false);
  });

  it("exposes the new proxy functions", () => {
    assert.equal(typeof proxyToken, "function");
    assert.equal(typeof proxySubmit, "function");
    assert.equal(typeof proxyGetStatus, "function");
  });
});

type MockResponseBody = {
  token?: string;
  expires_at?: string;
  ttl?: number;
  message?: string;
  status?: string;
  received_at?: string;
  results?: Record<string, unknown> | null;
  results_text?: string | null;
  error?: { code?: string; message?: string };
};

type MockEdgeResponse = EdgeResponse & {
  getStatusCode(): number;
  getBody(): MockResponseBody;
  getHeaders(): Map<string, string>;
  getRawBody(): string;
};

// Mock implementation of EdgeRequest and EdgeResponse
function mockRequest(
  method: string,
  op: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): EdgeRequest {
  return {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    query: { op },
    url: `/api/readiness/${op}`,
    body: JSON.stringify(body),
  } as unknown as EdgeRequest;
}

/** GET /api/readiness/status?token=… — token rides the URL query string. */
function mockStatusRequest(token: string): EdgeRequest {
  return {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    query: { op: "status" },
    url: `/api/readiness/status?token=${encodeURIComponent(token)}`,
  } as unknown as EdgeRequest;
}

function mockResponse(): MockEdgeResponse {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let responseBody: MockResponseBody = {};
  let rawBody = "";

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      responseBody = (body ?? {}) as MockResponseBody;
      rawBody = JSON.stringify(body ?? {});
      return this;
    },
    send(body?: unknown) {
      rawBody = typeof body === "string" ? body : JSON.stringify(body ?? "");
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    end() {
      return this;
    },
    // Mock getters for assertions
    getStatusCode() {
      return statusCode;
    },
    getBody() {
      return responseBody;
    },
    getHeaders() {
      return headers;
    },
    getRawBody() {
      return rawBody;
    },
  };
  return res as unknown as MockEdgeResponse;
}

describe("edge readiness ingest flow integration via proxy", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalFetch = globalThis.fetch;
  const fakeTokens = new Map<string, number>();
  const fakeSubmissions = new Map<
    string,
    { results?: Record<string, unknown>; results_text?: string }
  >();

  const setupMock = () => {
    delete process.env.DATABASE_URL;
    fakeTokens.clear();
    fakeSubmissions.clear();

    globalThis.fetch = async (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/readiness/token")) {
        // Unique token per mint so tests stay isolated from one another.
        const token = `mocked-token-${fakeTokens.size + 1}-abcdef1234567890`;
        fakeTokens.set(token, Date.now() + 30 * 60 * 1000);
        return new Response(
          JSON.stringify({
            token,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            ttl: 1800,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (urlStr.includes("/v1/readiness/submit")) {
        const body = JSON.parse(options?.body as string);
        const subToken = body.submission_token;
        const expiry = fakeTokens.get(subToken);
        if (!subToken || !expiry || expiry < Date.now()) {
          return new Response(
            JSON.stringify({
              error: {
                code: "INVALID_TOKEN",
                message: "The submission token is unknown or expired.",
              },
            }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          );
        }

        fakeSubmissions.set(subToken, {
          results: body.results as Record<string, unknown> | undefined,
          results_text: body.results_text as string | undefined,
        });

        return new Response(
          JSON.stringify({
            message: "Vygo has successfully received your readiness results.",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (urlStr.includes("/v1/readiness/status")) {
        const subToken = new URL(urlStr, "https://edge.test").searchParams.get("token") || "";
        // Simulate the upstream route not being deployed yet (bare Fastify 404,
        // no expired marker) — the edge must turn this into a keep-waiting 503.
        if (subToken === "no-route-yet-token-abcdef") {
          return new Response(
            JSON.stringify({
              message: "Route GET:/v1/readiness/status not found",
              error: "Not Found",
              statusCode: 404,
            }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          );
        }
        const expiry = fakeTokens.get(subToken);
        if (!subToken || !expiry) {
          return new Response(
            JSON.stringify({
              status: "expired",
              error: {
                code: "NOT_FOUND",
                message: "The submission token is unknown or expired.",
              },
            }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          );
        }
        const payload = fakeSubmissions.get(subToken);
        if (!payload) {
          if (expiry < Date.now()) {
            return new Response(
              JSON.stringify({
                status: "expired",
                error: {
                  code: "EXPIRED_TOKEN",
                  message: "The submission token is unknown or expired.",
                },
              }),
              {
                status: 410,
                headers: { "content-type": "application/json" },
              },
            );
          }
          return new Response(
            JSON.stringify({
              token: subToken,
              status: "pending",
              expires_at: new Date(expiry).toISOString(),
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({
            token: subToken,
            status: "ready",
            expires_at: new Date(expiry).toISOString(),
            received_at: new Date().toISOString(),
            results: payload.results ?? null,
            results_text: payload.results_text ?? null,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response("Not Found", { status: 404 });
    };
  };

  const teardownMock = () => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    globalThis.fetch = originalFetch;
  };

  it("POST /api/readiness/token returns HTTP 200 with a short-lived token", async () => {
    setupMock();
    try {
      const req = mockRequest("POST", "token");
      const res = mockResponse();

      await handler(req, res);

      assert.equal(res.getStatusCode(), 200);
      const body = res.getBody();
      assert.ok(body.token);
      assert.ok(body.expires_at);
      assert.equal(body.ttl, 1800);
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with bogus token returns 400", async () => {
    setupMock();
    try {
      const req = mockRequest("POST", "submit", {
        submission_token: "bogus-token-123",
        results: { score: 95 },
      });
      const res = mockResponse();

      await handler(req, res);

      assert.equal(res.getStatusCode(), 400);
      const body = res.getBody();
      assert.equal(body.error?.code, "INVALID_TOKEN");
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with valid token and structured results returns 200", async () => {
    setupMock();
    try {
      // 1. Get token
      const tokenReq = mockRequest("POST", "token");
      const tokenRes = mockResponse();
      await handler(tokenReq, tokenRes);
      const token = tokenRes.getBody().token;

      // 2. Submit results
      const submitReq = mockRequest("POST", "submit", {
        submission_token: token,
        results: { score: 95 },
      });
      const submitRes = mockResponse();
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 200);
      const body = submitRes.getBody();
      assert.ok(body.message?.includes("received"));
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with valid token and plain-text results returns 200", async () => {
    setupMock();
    try {
      // 1. Get token
      const tokenReq = mockRequest("POST", "token");
      const tokenRes = mockResponse();
      await handler(tokenReq, tokenRes);
      const token = tokenRes.getBody().token;

      // 2. Submit plain text
      const submitReq = mockRequest("POST", "submit", {
        submission_token: token,
        results_text: "High database replication lag, no backup configuration found.",
      });
      const submitRes = mockResponse();
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 200);
      const body = submitRes.getBody();
      assert.ok(body.message?.includes("received"));
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with no results or results_text returns 400 and leaves the token non-ready", async () => {
    setupMock();
    try {
      const tokenRes = mockResponse();
      await handler(mockRequest("POST", "token"), tokenRes);
      const token = tokenRes.getBody().token as string;

      const submitReq = mockRequest("POST", "submit", { submission_token: token });
      const submitRes = mockResponse();
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 400);
      assert.equal(submitRes.getBody().error?.code, "VALIDATION_ERROR");

      const statusRes = mockResponse();
      await handler(mockStatusRequest(token), statusRes);
      assert.equal(statusRes.getBody().status, "pending");
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with an empty results object and no results_text returns 400", async () => {
    setupMock();
    try {
      const tokenRes = mockResponse();
      await handler(mockRequest("POST", "token"), tokenRes);
      const token = tokenRes.getBody().token as string;

      const submitReq = mockRequest("POST", "submit", {
        submission_token: token,
        results: {},
      });
      const submitRes = mockResponse();
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 400);
      assert.equal(submitRes.getBody().error?.code, "VALIDATION_ERROR");

      const statusRes = mockResponse();
      await handler(mockStatusRequest(token), statusRes);
      assert.equal(statusRes.getBody().status, "pending");
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with a blank results_text string and no results returns 400", async () => {
    setupMock();
    try {
      const tokenRes = mockResponse();
      await handler(mockRequest("POST", "token"), tokenRes);
      const token = tokenRes.getBody().token as string;

      const submitReq = mockRequest("POST", "submit", {
        submission_token: token,
        results_text: "   ",
      });
      const submitRes = mockResponse();
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 400);
      assert.equal(submitRes.getBody().error?.code, "VALIDATION_ERROR");

      const statusRes = mockResponse();
      await handler(mockStatusRequest(token), statusRes);
      assert.equal(statusRes.getBody().status, "pending");
    } finally {
      teardownMock();
    }
  });

  it("GET /api/readiness/status returns pending for a freshly minted token", async () => {
    setupMock();
    try {
      const tokenRes = mockResponse();
      await handler(mockRequest("POST", "token"), tokenRes);
      const token = tokenRes.getBody().token as string;

      const res = mockResponse();
      await handler(mockStatusRequest(token), res);

      assert.equal(res.getStatusCode(), 200);
      const body = res.getBody();
      assert.equal(body.status, "pending");
      assert.equal(body.results_text, undefined);
    } finally {
      teardownMock();
    }
  });

  it("GET /api/readiness/status returns ready with the ingested payload after submit", async () => {
    setupMock();
    try {
      const tokenRes = mockResponse();
      await handler(mockRequest("POST", "token"), tokenRes);
      const token = tokenRes.getBody().token as string;

      await handler(
        mockRequest("POST", "submit", {
          submission_token: token,
          results_text: "No backups configured.",
          results: { overall: 82 },
        }),
        mockResponse(),
      );

      const res = mockResponse();
      await handler(mockStatusRequest(token), res);

      assert.equal(res.getStatusCode(), 200);
      const body = res.getBody();
      assert.equal(body.status, "ready");
      assert.equal(body.results_text, "No backups configured.");
      assert.deepEqual(body.results, { overall: 82 });
      assert.ok(body.received_at);
    } finally {
      teardownMock();
    }
  });

  it("GET /api/readiness/status with an unknown token returns a distinguishable expired response", async () => {
    setupMock();
    try {
      const res = mockResponse();
      await handler(mockStatusRequest("unknown-token-1234567890"), res);

      assert.equal(res.getStatusCode(), 404);
      const body = res.getBody();
      assert.equal(body.status, "expired");
      assert.equal(body.error?.code, "NOT_FOUND");
    } finally {
      teardownMock();
    }
  });

  it("GET /api/readiness/status with a malformed token answers like an unknown token", async () => {
    setupMock();
    try {
      const res = mockResponse();
      await handler(mockStatusRequest("bogus"), res);

      assert.equal(res.getStatusCode(), 404);
      const body = res.getBody();
      assert.equal(body.status, "expired");
      assert.equal(body.error?.code, "NOT_FOUND");
    } finally {
      teardownMock();
    }
  });

  it("GET /api/readiness/status keeps waiting (503) when the upstream route is not deployed", async () => {
    setupMock();
    try {
      const res = mockResponse();
      await handler(mockStatusRequest("no-route-yet-token-abcdef"), res);

      assert.equal(res.getStatusCode(), 503);
      const body = res.getBody();
      assert.equal(body.status, undefined);
      assert.equal(body.error?.code, "UNAVAILABLE");
    } finally {
      teardownMock();
    }
  });
});
