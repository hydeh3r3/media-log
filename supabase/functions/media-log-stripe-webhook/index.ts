import {
  StripeWebhookError,
  entitlementUserId,
  shouldUnlockSync,
  verifyStripeEvent,
  type StripeCheckoutSession,
} from "../_shared/stripe-webhook.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

type Env = {
  secretKey: string;
  stripeWebhookSecret: string;
  supabaseUrl: string;
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
  const event = await verifyStripeEvent(env.stripeWebhookSecret, body, request.headers.get("stripe-signature"));

  if (shouldUnlockSync(event)) {
    await upsertEntitlement(env, event.data!.object!);
  }

  return jsonResponse({ ok: true, received: true });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    const status = error instanceof HttpResponseError || error instanceof StripeWebhookError ? error.status : 500;
    const message = status === 500 ? "Internal server error." : error instanceof Error ? error.message : "Request failed.";
    if (status === 500) {
      console.error(error);
    }
    return jsonResponse({ ok: false, error: message }, status);
  }
});
