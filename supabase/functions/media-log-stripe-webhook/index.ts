const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const STRIPE_TOLERANCE_SECONDS = 300;

type Env = {
  secretKey: string;
  stripeWebhookSecret: string;
  supabaseUrl: string;
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: StripeCheckoutSession;
  };
};

type StripeCheckoutSession = {
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

class HttpResponseError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function httpError(status: number, message: string): HttpResponseError {
  return new HttpResponseError(status, message);
}

function readJsonSecret(name: string): unknown {
  const value = Deno.env.get(name);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstSecretValue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const values = value as Record<string, unknown>;
  if (typeof values.default === "string") return values.default;
  return Object.values(values).find((item): item is string => typeof item === "string") || null;
}

function readEnv(): Env {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey =
    firstSecretValue(readJsonSecret("SUPABASE_SECRET_KEYS")) || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!supabaseUrl || !secretKey) {
    throw httpError(500, "Supabase webhook is not configured.");
  }

  if (!stripeWebhookSecret) {
    throw httpError(500, "Stripe webhook is not configured.");
  }

  return {
    secretKey,
    stripeWebhookSecret,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
  };
}

function parseStripeSignature(header: string | null): { timestamp: string; signatures: string[] } {
  if (!header) {
    throw httpError(400, "Missing Stripe-Signature header.");
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
    throw httpError(400, "Invalid Stripe-Signature header.");
  }

  return { timestamp, signatures };
}

function assertFreshTimestamp(timestamp: string): void {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    throw httpError(400, "Invalid Stripe timestamp.");
  }

  const age = Math.abs(Date.now() / 1000 - seconds);
  if (age > STRIPE_TOLERANCE_SECONDS) {
    throw httpError(400, "Stripe timestamp is too old.");
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

async function verifyStripeEvent(env: Env, body: string, signatureHeader: string | null): Promise<StripeEvent> {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  assertFreshTimestamp(timestamp);
  const expected = await hmacSha256Hex(env.stripeWebhookSecret, `${timestamp}.${body}`);

  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) {
    throw httpError(400, "Stripe signature verification failed.");
  }

  return JSON.parse(body) as StripeEvent;
}

function shouldUnlockSync(event: StripeEvent): boolean {
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

function entitlementUserId(session: StripeCheckoutSession): string {
  const userId = session.metadata?.media_log_user_id || session.client_reference_id || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw httpError(400, "Stripe session is missing a valid Media Log user ID.");
  }
  return userId;
}

async function upsertEntitlement(env: Env, session: StripeCheckoutSession): Promise<void> {
  const userId = entitlementUserId(session);
  const payload = [
    {
      user_id: userId,
      status: "active",
      plan_id: "sync_between_devices_2_usd",
      price_cents: 200,
      currency: "usd",
      provider: "stripe",
      provider_customer_id: session.customer || null,
      provider_payment_id: session.payment_intent || session.id || null,
      granted_at: new Date().toISOString(),
      expires_at: null,
    },
  ];

  const response = await fetch(`${env.supabaseUrl}/rest/v1/media_log_sync_entitlements?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase entitlement upsert error", response.status, detail);
    throw httpError(502, "Entitlement update failed.");
  }
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const env = readEnv();
  const body = await request.text();
  const event = await verifyStripeEvent(env, body, request.headers.get("stripe-signature"));

  if (shouldUnlockSync(event)) {
    await upsertEntitlement(env, event.data!.object!);
  }

  return jsonResponse({ ok: true, received: true });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    const status = error instanceof HttpResponseError ? error.status : 500;
    const message = status === 500 ? "Internal server error." : error instanceof Error ? error.message : "Request failed.";
    if (status === 500) {
      console.error(error);
    }
    return jsonResponse({ ok: false, error: message }, status);
  }
});
