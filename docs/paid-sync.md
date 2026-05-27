# Paid Sync

Cross-device sync is a paid feature.

The unlock price is `$2`.

## What Lives In PostgreSQL

Supabase uses PostgreSQL. The sync unlock lives in:

```text
public.media_log_sync_entitlements
```

One row belongs to one Supabase Auth user.

Important fields:

- `user_id`: the Supabase Auth user ID
- `status`: `active`, `inactive`, `past_due`, or `canceled`
- `plan_id`: `sync_between_devices_2_usd`
- `price_cents`: `200`
- `currency`: `usd`
- `provider`: the payment provider name
- `provider_customer_id`: the payment customer ID
- `provider_payment_id`: the payment or subscription ID
- `expires_at`: optional end date

The database check keeps the unlock price at `200` cents in `usd`.

## What The Edge Function Does

The Supabase Edge Function checks three things before sync:

1. The request has a valid Supabase Auth token.
2. The user has a row in `media_log_sync_entitlements`.
3. The row is active, costs `200` cents, uses `usd`, and is not expired.

If any check fails, sync returns:

```text
402 Payment Required
```

The message is:

```text
Cross-device sync requires the $2 sync unlock.
```

## Stripe Checkout

The repo does not store card data.

Stripe handles checkout and card storage.

The clients call this Supabase Edge Function after sign-in:

```text
https://<project-ref>.supabase.co/functions/v1/media-log-checkout
```

That function creates a Stripe Checkout Session for one payment:

- amount: `$2`
- currency: `usd`
- product: `Media Log Sync Unlock`

The function adds the Supabase Auth user ID to Stripe metadata. The client never receives a Stripe secret key.

## Stripe Webhook

Stripe should send payment events to this Supabase Edge Function:

```text
https://<project-ref>.supabase.co/functions/v1/media-log-stripe-webhook
```

The webhook verifies the `Stripe-Signature` header. It only unlocks sync for paid Checkout Sessions with `amount_total` `200` and currency `usd`.

Handled events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

After payment succeeds, the webhook upserts the PostgreSQL entitlement row.

## Required Secrets

Set these Supabase function secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `MEDIA_LOG_CHECKOUT_SUCCESS_URL`
- `MEDIA_LOG_CHECKOUT_CANCEL_URL`

Supabase also provides these:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS`
- `SUPABASE_SECRET_KEYS`

Do not commit any secret value.

Deploy with:

```sh
bun run supabase:deploy
```

## Manual Unlock

Example manual unlock:

```sql
insert into public.media_log_sync_entitlements (
  user_id,
  status,
  provider,
  provider_customer_id,
  provider_payment_id,
  granted_at
) values (
  '<supabase-auth-user-id>',
  'active',
  'manual',
  null,
  '<payment-reference>',
  now()
)
on conflict (user_id) do update set
  status = 'active',
  provider = excluded.provider,
  provider_customer_id = excluded.provider_customer_id,
  provider_payment_id = excluded.provider_payment_id,
  granted_at = excluded.granted_at,
  expires_at = null;
```

Use the Supabase SQL editor only if Stripe is not ready yet. Do not run entitlement writes from the Chrome extension or iOS app.

## Local Development

Local dev sync is not pay gated.

Run:

```sh
bun run sync:dev
```

Production Supabase sync is pay gated.
