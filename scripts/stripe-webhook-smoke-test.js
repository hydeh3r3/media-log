import { createHmac } from "node:crypto";
import {
  StripeWebhookError,
  entitlementUserId,
  shouldUnlockSync,
  verifyStripeEvent,
} from "../supabase/functions/_shared/stripe-webhook.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripeSignatureHeader(secret, body, timestamp) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function assertRejectsStripeWebhook(fn, expectedMessage) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof StripeWebhookError, "Expected a StripeWebhookError.");
    assert(error.status === 400, "Expected Stripe webhook errors to be HTTP 400.");
    assert(error.message.includes(expectedMessage), `Expected error message to include: ${expectedMessage}`);
    return;
  }

  throw new Error("Expected Stripe webhook check to fail.");
}

const secret = "local-media-log-webhook-secret";
const userId = "11111111-1111-4111-8111-111111111111";
const nowMs = Date.now();
const timestamp = Math.floor(nowMs / 1000);
const paidSession = {
  id: "cs_safe_media_log_sync",
  mode: "payment",
  payment_status: "paid",
  amount_total: 200,
  currency: "usd",
  customer: "cus_safe_media_log_sync",
  payment_intent: "pi_safe_media_log_sync",
  client_reference_id: userId,
  metadata: {
    media_log_user_id: userId,
    plan_id: "sync_between_devices_2_usd",
  },
};
const event = {
  id: "evt_safe_media_log_sync",
  type: "checkout.session.completed",
  data: {
    object: paidSession,
  },
};
const body = JSON.stringify(event);
const signature = stripeSignatureHeader(secret, body, timestamp);
const verified = await verifyStripeEvent(secret, body, signature, nowMs);

assert(verified.id === event.id, "Webhook verification should return the event.");
assert(shouldUnlockSync(verified), "Paid $2 Checkout Session should unlock sync.");
assert(entitlementUserId(paidSession) === userId, "Webhook should read the Supabase Auth user ID.");

await assertRejectsStripeWebhook(
  () => verifyStripeEvent(secret, body, stripeSignatureHeader("wrong-secret", body, timestamp), nowMs),
  "signature verification failed",
);

await assertRejectsStripeWebhook(
  () => verifyStripeEvent(secret, body, stripeSignatureHeader(secret, body, timestamp - 301), nowMs),
  "too old",
);

assert(
  !shouldUnlockSync({
    ...event,
    data: { object: { ...paidSession, amount_total: 199 } },
  }),
  "Underpaid Checkout Session must not unlock sync.",
);

assert(
  !shouldUnlockSync({
    ...event,
    data: { object: { ...paidSession, currency: "eur" } },
  }),
  "Non-USD Checkout Session must not unlock sync.",
);

await assertRejectsStripeWebhook(
  () => Promise.resolve(entitlementUserId({ ...paidSession, metadata: { media_log_user_id: "not-a-user-id" } })),
  "valid Media Log user ID",
);

console.log("Stripe webhook smoke test passed with safe synthetic events.");
