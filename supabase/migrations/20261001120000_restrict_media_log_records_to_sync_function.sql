-- Only the media-log-sync Edge Function reads or writes sync rows. It uses the
-- service role and checks the paid sync entitlement first, so signed-in clients
-- must not reach this table directly through the Data API.
drop policy if exists "Users can read their media log" on public.media_log_records;
drop policy if exists "Users can insert their media log" on public.media_log_records;
drop policy if exists "Users can update their media log" on public.media_log_records;

revoke all on table public.media_log_records from anon, authenticated;
