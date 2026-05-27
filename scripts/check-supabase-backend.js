import { readFile } from "node:fs/promises";

const REQUIRED_FILES = [
  "supabase/config.toml",
  "supabase/migrations/20260526173000_create_media_log_records.sql",
  "supabase/migrations/20260527031500_create_media_log_sync_entitlements.sql",
  "supabase/functions/_shared/stripe-webhook.ts",
  "supabase/functions/media-log-sync/index.ts",
  "supabase/functions/media-log-checkout/index.ts",
  "supabase/functions/media-log-stripe-webhook/index.ts",
  "scripts/stripe-webhook-smoke-test.js",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function assertBuilds(path, label) {
  const result = await Bun.build({
    entrypoints: [new URL(`../${path}`, import.meta.url).pathname],
    write: false,
    target: "bun",
  });

  assert(result.success, `${label} must build: ${result.logs.map((log) => log.message).join("; ")}`);
}

for (const path of REQUIRED_FILES) {
  await read(path);
}

const config = await read("supabase/config.toml");
assert(config.includes("verify_jwt = true"), "Supabase function must require JWT verification.");
assert(config.includes("[functions.media-log-checkout]"), "Supabase config must define the checkout function.");
assert(config.includes("[functions.media-log-stripe-webhook]"), "Supabase config must define the Stripe webhook function.");
assert(
  /\[functions\.media-log-checkout\]\s+verify_jwt = true/s.test(config),
  "Checkout function must require Supabase JWT verification.",
);
assert(
  /\[functions\.media-log-stripe-webhook\]\s+verify_jwt = false/s.test(config),
  "Stripe webhook function must not require Supabase JWT verification.",
);

const recordMigration = await read("supabase/migrations/20260526173000_create_media_log_records.sql");
const entitlementMigration = await read("supabase/migrations/20260527031500_create_media_log_sync_entitlements.sql");
const migrations = `${recordMigration}\n${entitlementMigration}`;
assert(migrations.includes("enable row level security"), "Migration must enable row-level security.");
assert(migrations.includes("auth.uid() = user_id"), "Migration must restrict rows to the authenticated user.");
assert(migrations.includes("references auth.users"), "Rows must be owned by Supabase Auth users.");
assert(migrations.includes("media_log_sync_entitlements"), "Migration must define PostgreSQL sync entitlements.");
assert(migrations.includes("price_cents = 200"), "Sync entitlement price must be locked to 200 cents.");
assert(migrations.includes("Users can read their sync entitlement"), "Users must be able to read only their own sync entitlement.");

const functionSource = await read("supabase/functions/media-log-sync/index.ts");
const transpiledFunction = new Bun.Transpiler({ loader: "ts" }).transformSync(functionSource);
new Function(transpiledFunction);

const checkoutSource = await read("supabase/functions/media-log-checkout/index.ts");
await assertBuilds("supabase/functions/media-log-checkout/index.ts", "Checkout function");
const webhookSource = await read("supabase/functions/media-log-stripe-webhook/index.ts");
const webhookLogicSource = await read("supabase/functions/_shared/stripe-webhook.ts");
const webhookCombinedSource = `${webhookSource}\n${webhookLogicSource}`;
await assertBuilds("supabase/functions/media-log-stripe-webhook/index.ts", "Stripe webhook function");

assert(functionSource.includes("/auth/v1/user"), "Function must validate the bearer token with Supabase Auth.");
assert(functionSource.includes("SUPABASE_SECRET_KEYS"), "Function must read server-only Supabase secret keys.");
assert(functionSource.includes("mergeSnapshots"), "Function must merge incoming data with stored data before writing.");
assert(functionSource.includes("assertSyncEntitlement"), "Function must gate production sync by PostgreSQL entitlement.");
assert(functionSource.includes("media_log_sync_entitlements"), "Function must read sync entitlements from PostgreSQL.");
assert(functionSource.includes("402"), "Function must use a payment-required response when sync is not unlocked.");
assert(!/eyJ[A-Za-z0-9_-]{20,}\./.test(functionSource), "Function must not contain hard-coded JWT values.");
assert(!/sb_secret_[A-Za-z0-9_-]+/.test(functionSource), "Function must not contain hard-coded Supabase secret keys.");

assert(
  checkoutSource.includes("https://api.stripe.com/v1/checkout/sessions"),
  "Checkout function must create Stripe Checkout Sessions.",
);
assert(checkoutSource.includes("unit_amount") && checkoutSource.includes("200"), "Checkout price must be $2.");
assert(checkoutSource.includes("client_reference_id"), "Checkout function must attach the Supabase user ID.");
assert(checkoutSource.includes("metadata[media_log_user_id]"), "Checkout function must add Media Log user metadata.");
assert(!/sk_(test|live)_[A-Za-z0-9]+/.test(checkoutSource), "Checkout function must not contain a Stripe secret key.");

assert(webhookCombinedSource.includes("Stripe-Signature"), "Webhook function must verify Stripe signatures.");
assert(webhookCombinedSource.includes("SHA-256"), "Webhook function must use HMAC SHA-256 signature checks.");
assert(webhookCombinedSource.includes("checkout.session.completed"), "Webhook function must handle completed Checkout Sessions.");
assert(
  webhookCombinedSource.includes("checkout.session.async_payment_succeeded"),
  "Webhook function must handle delayed payment success.",
);
assert(webhookSource.includes("media_log_sync_entitlements"), "Webhook function must write sync entitlements.");
assert(webhookSource.includes("price_cents") && webhookSource.includes("200"), "Webhook entitlement price must be $2.");
assert(!/whsec_[A-Za-z0-9]+/.test(webhookCombinedSource), "Webhook function must not contain a Stripe webhook secret.");

console.log("Supabase backend checks passed.");
