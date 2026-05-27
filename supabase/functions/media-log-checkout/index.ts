const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

type Env = {
  cancelUrl: string;
  publishableKey: string;
  stripeSecretKey: string;
  successUrl: string;
  supabaseUrl: string;
};

type SupabaseUser = {
  id: string;
  email?: string;
};

type StripeCheckoutSession = {
  id?: string;
  url?: string;
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
    headers: CORS_HEADERS,
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
  const publishableKey =
    firstSecretValue(readJsonSecret("SUPABASE_PUBLISHABLE_KEYS")) || Deno.env.get("SUPABASE_ANON_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const successUrl = Deno.env.get("MEDIA_LOG_CHECKOUT_SUCCESS_URL");
  const cancelUrl = Deno.env.get("MEDIA_LOG_CHECKOUT_CANCEL_URL") || successUrl;

  if (!supabaseUrl || !publishableKey) {
    throw httpError(500, "Supabase checkout is not configured.");
  }

  if (!stripeSecretKey || !successUrl || !cancelUrl) {
    throw httpError(500, "Stripe checkout is not configured.");
  }

  return {
    cancelUrl,
    publishableKey,
    stripeSecretKey,
    successUrl,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
  };
}

async function readUser(env: Env, authorization: string | null): Promise<SupabaseUser> {
  if (!authorization?.startsWith("Bearer ")) {
    throw httpError(401, "Missing bearer token.");
  }

  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.publishableKey,
      authorization,
    },
  });

  if (!response.ok) {
    throw httpError(401, "Invalid bearer token.");
  }

  const user = await response.json() as SupabaseUser;
  if (!user?.id) {
    throw httpError(401, "Invalid bearer token.");
  }

  return user;
}

async function createStripeCheckoutSession(env: Env, user: SupabaseUser): Promise<string> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", env.successUrl);
  body.set("cancel_url", env.cancelUrl);
  body.set("client_reference_id", user.id);
  body.set("customer_creation", "always");
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", "200");
  body.set("line_items[0][price_data][product_data][name]", "Media Log Sync Unlock");
  body.set("line_items[0][price_data][product_data][description]", "Cross-device sync for Media Log.");
  body.set("metadata[media_log_user_id]", user.id);
  body.set("metadata[plan_id]", "sync_between_devices_2_usd");
  body.set("payment_intent_data[metadata][media_log_user_id]", user.id);
  body.set("payment_intent_data[metadata][plan_id]", "sync_between_devices_2_usd");

  if (user.email) {
    body.set("customer_email", user.email);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const session = await response.json() as StripeCheckoutSession & { error?: { message?: string } };
  if (!response.ok || !session.url) {
    console.error("Stripe checkout error", response.status, session.error?.message || "No checkout URL returned.");
    throw httpError(502, "Checkout could not start.");
  }

  return session.url;
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const env = readEnv();
  const user = await readUser(env, request.headers.get("authorization"));
  const checkoutUrl = await createStripeCheckoutSession(env, user);

  return jsonResponse({ ok: true, checkoutUrl });
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
