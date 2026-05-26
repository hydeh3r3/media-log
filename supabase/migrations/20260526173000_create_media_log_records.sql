create table if not exists public.media_log_records (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null default 0,
  data jsonb not null default '{"currentWeek": null, "history": [], "addDraft": null, "tombstones": {}}'::jsonb,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_log_records_data_is_object check (jsonb_typeof(data) = 'object')
);

create index if not exists media_log_records_updated_at_idx
  on public.media_log_records (updated_at desc);

create or replace function public.touch_media_log_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_media_log_records_updated_at on public.media_log_records;

create trigger touch_media_log_records_updated_at
before update on public.media_log_records
for each row
execute function public.touch_media_log_records_updated_at();

alter table public.media_log_records enable row level security;

drop policy if exists "Users can read their media log" on public.media_log_records;
create policy "Users can read their media log"
on public.media_log_records
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their media log" on public.media_log_records;
create policy "Users can insert their media log"
on public.media_log_records
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their media log" on public.media_log_records;
create policy "Users can update their media log"
on public.media_log_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
