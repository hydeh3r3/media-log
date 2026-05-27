const STRIPE_TOLERANCE_SECONDS = 300;

export type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: StripeCheckoutSession;
  };
};

export type StripeCheckoutSession = {
  id?: string;
  mode?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | null;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string | null> | null;
};

export class StripeWebhookError extends Error {
  status = 400;
}

function stripeWebhookError(message: string): StripeWebhookError {
  return new StripeWebhookError(message);
}

function parseStripeSignature(header: string | null): { timestamp: string; signatures: string[] } {
  if (!header) {
    throw stripeWebhookError("Missing Stripe-Signature header.");
  }

  const values = header.split(",").reduce((accumulator, part) => {
    const [key, value] = part.split("=", 2);
    if (!key || !value) return accumulator;
    const bucket = accumulator.get(key) || [];
    bucket.push(value);
    accumulator.set(key, bucket);
    return accumulator;
  }, new Map<string, string[]>());

  const timestamp = values.get("t")?.[0];
  const signatures = values.get("v1") || [];
  if (!timestamp || signatures.length === 0) {
    throw stripeWebhookError("Invalid Stripe-Signature header.");
  }

  return { timestamp, signatures };
}

function assertFreshTimestamp(timestamp: string, nowMs: number): void {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    throw stripeWebhookError("Invalid Stripe timestamp.");
  }

  const age = Math.abs(nowMs / 1000 - seconds);
  if (age > STRIPE_TOLERANCE_SECONDS) {
    throw stripeWebhookError("Stripe timestamp is too old.");
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyStripeEvent(
  secret: string,
  body: string,
  signatureHeader: string | null,
  nowMs = Date.now(),
): Promise<StripeEvent> {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  assertFreshTimestamp(timestamp, nowMs);
  const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`);

  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) {
    throw stripeWebhookError("Stripe signature verification failed.");
  }

  return JSON.parse(body) as StripeEvent;
}

export function shouldUnlockSync(event: StripeEvent): boolean {
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type || "")) {
    return false;
  }

  const session = event.data?.object;
  return Boolean(
    session &&
      session.mode === "payment" &&
      session.payment_status === "paid" &&
      session.amount_total === 200 &&
      session.currency === "usd",
  );
}

export function entitlementUserId(session: StripeCheckoutSession): string {
  const userId = session.metadata?.media_log_user_id || session.client_reference_id || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw stripeWebhookError("Stripe session is missing a valid Media Log user ID.");
  }
  return userId;
}
