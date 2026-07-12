/**
 * Email delivery transports (Resend HTTP + deterministic mock).
 */

export type SendEmailInput = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  /** Stable provider idempotency key (non-secret). */
  idempotencyKey: string;
};

export type SendEmailResult = {
  providerMessageId: string;
  mock?: boolean;
};

export type EmailTransport = {
  send(input: SendEmailInput): Promise<SendEmailResult>;
};

export class MockEmailTransport implements EmailTransport {
  readonly sent: SendEmailInput[] = [];
  failTimes = 0;
  private failuresRemaining: number;

  constructor(options?: { failTimes?: number }) {
    this.failuresRemaining = options?.failTimes ?? 0;
    this.failTimes = this.failuresRemaining;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("MOCK_TRANSPORT_FAILURE");
    }
    this.sent.push(input);
    return {
      providerMessageId: `mock_${input.idempotencyKey}`,
      mock: true,
    };
  }
}

/**
 * Resend REST transport. Uses Idempotency-Key header for stable retries.
 * Never logs request bodies.
 */
export class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const status = res.status;
      // Avoid reading body into logs; short error only.
      throw new Error(`RESEND_HTTP_${status}`);
    }

    let providerMessageId = `resend_${input.idempotencyKey}`;
    try {
      const json = (await res.json()) as { id?: string };
      if (json?.id) providerMessageId = String(json.id);
    } catch {
      // ignore parse errors — delivery succeeded
    }
    return { providerMessageId };
  }
}

export function createEmailTransport(options: {
  apiKey?: string | null;
  forceMock?: boolean;
}): EmailTransport {
  if (options.forceMock || !options.apiKey) {
    return new MockEmailTransport();
  }
  return new ResendTransport(options.apiKey);
}
