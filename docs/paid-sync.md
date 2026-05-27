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

## Payment Provider

The repo does not store card data.

A payment provider should handle checkout and card storage. After payment succeeds, a webhook or admin action should upsert the PostgreSQL entitlement row.

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

Use the Supabase SQL editor or a trusted server-side webhook for this. Do not run entitlement writes from the Chrome extension or iOS app.

## Local Development

Local dev sync is not pay gated.

Run:

```sh
bun run sync:dev
```

Production Supabase sync is pay gated.
