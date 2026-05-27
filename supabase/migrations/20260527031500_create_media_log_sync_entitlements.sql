create table if not exists public.media_log_sync_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'inactive',
  plan_id text not null default 'sync_between_devices_2_usd',
  price_cents integer not null default 200,
  currency text not null default 'usd',
  provider text,
  provider_customer_id text,
  provider_payment_id text,
  granted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_log_sync_entitlements_status_check
    check (status in ('active', 'inactive', 'past_due', 'canceled')),
  constraint media_log_sync_entitlements_price_check
    check (price_cents = 200 and currency = 'usd')
);

create index if not exists media_log_sync_entitlements_status_idx
  on public.media_log_sync_entitlements (status, expires_at);

create or replace function public.touch_media_log_sync_entitlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_media_log_sync_entitlements_updated_at on public.media_log_sync_entitlements;

create trigger touch_media_log_sync_entitlements_updated_at
before update on public.media_log_sync_entitlements
for each row
execute function public.touch_media_log_sync_entitlements_updated_at();

alter table public.media_log_sync_entitlements enable row level security;

drop policy if exists "Users can read their sync entitlement" on public.media_log_sync_entitlements;
create policy "Users can read their sync entitlement"
on public.media_log_sync_entitlements
for select
to authenticated
using (auth.uid() = user_id);
