import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidReadinessToken, proxyToken, proxySubmit } from "./readiness.js";
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
  });
});

// Mock implementation of EdgeRequest and EdgeResponse
function mockRequest(method: string, op: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}): EdgeRequest {
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

function mockResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let responseBody: any = null;
  let ended = false;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: any) {
      responseBody = body;
      ended = true;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    end() {
      ended = true;
      return this;
    },
    // Mock getters for assertions
    getStatusCode() { return statusCode; },
    getBody() { return responseBody; },
    getHeaders() { return headers; }
  };
  return res as unknown as EdgeResponse & { getStatusCode(): number; getBody(): any; getHeaders(): Map<string, string> };
}

describe("edge readiness ingest flow integration via proxy", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalFetch = globalThis.fetch;
  const fakeTokens = new Map<string, number>();

  const setupMock = () => {
    delete process.env.DATABASE_URL;

    globalThis.fetch = async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/readiness/token")) {
        const token = "mocked-token-1234567890";
        fakeTokens.set(token, Date.now() + 30 * 60 * 1000);
        return new Response(JSON.stringify({
          token,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          ttl: 1800,
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (urlStr.includes("/v1/readiness/submit")) {
        const body = JSON.parse(options?.body as string);
        const subToken = body.submission_token;
        const expiry = fakeTokens.get(subToken);
        if (!subToken || !expiry || expiry < Date.now()) {
          return new Response(JSON.stringify({
            error: { code: "INVALID_TOKEN", message: "The submission token is unknown or expired." }
          }), {
            status: 400,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          message: "Vygo has successfully received your readiness results."
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
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
      const res = mockResponse() as any;

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
        results: { score: 95 }
      });
      const res = mockResponse() as any;

      await handler(req, res);

      assert.equal(res.getStatusCode(), 400);
      const body = res.getBody();
      assert.equal(body.error.code, "INVALID_TOKEN");
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with valid token and structured results returns 200", async () => {
    setupMock();
    try {
      // 1. Get token
      const tokenReq = mockRequest("POST", "token");
      const tokenRes = mockResponse() as any;
      await handler(tokenReq, tokenRes);
      const token = tokenRes.getBody().token;

      // 2. Submit results
      const submitReq = mockRequest("POST", "submit", {
        submission_token: token,
        results: { score: 95 }
      });
      const submitRes = mockResponse() as any;
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 200);
      const body = submitRes.getBody();
      assert.ok(body.message.includes("received"));
    } finally {
      teardownMock();
    }
  });

  it("POST /api/readiness/submit with valid token and plain-text results returns 200", async () => {
    setupMock();
    try {
      // 1. Get token
      const tokenReq = mockRequest("POST", "token");
      const tokenRes = mockResponse() as any;
      await handler(tokenReq, tokenRes);
      const token = tokenRes.getBody().token;

      // 2. Submit plain text
      const submitReq = mockRequest("POST", "submit", {
        submission_token: token,
        results_text: "High database replication lag, no backup configuration found."
      });
      const submitRes = mockResponse() as any;
      await handler(submitReq, submitRes);

      assert.equal(submitRes.getStatusCode(), 200);
      const body = submitRes.getBody();
      assert.ok(body.message.includes("received"));
    } finally {
      teardownMock();
    }
  });
});
