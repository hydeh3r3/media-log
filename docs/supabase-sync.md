# Supabase Sync Setup

Supabase is the production sync path for Media Log.

The Chrome extension and iOS app both talk to one HTTPS function:

`https://<project-ref>.supabase.co/functions/v1/media-log-sync`

The clients may append `/v1/media-log` to that URL. The function supports that path.

## What It Stores

The database stores one row per signed-in user.

That row contains:

- the current week
- archived weeks
- the add-entry draft
- deleted-entry tombstones
- a revision number

The row is owned by the Supabase Auth user ID.

## Auth

Use Supabase Auth to create your personal account.

The sync token in Chrome and iOS should be a Supabase user access token. Do not use the service key in either client.

The iOS app stores this token in Keychain.

The Edge Function checks the user token before it reads or writes data.

## Deploy

Install or run the Supabase CLI with `bunx`.

```sh
bunx supabase login
bunx supabase link --project-ref <project-ref>
bunx supabase db push
bunx supabase functions deploy media-log-sync
```

Supabase provides these function secrets by default:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS`
- `SUPABASE_SECRET_KEYS`

Older projects may expose:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The function supports both forms. Do not commit any secret value.

## Client Settings

Use these settings in Chrome and iOS:

- Endpoint: `https://<project-ref>.supabase.co/functions/v1/media-log-sync`
- User ID: `personal`
- Token: your Supabase user access token

The Supabase function ignores the typed User ID for production data ownership. It uses the Auth user ID from the token.

The local Bun server still uses the User ID field for local testing.

## Migration

In the Chrome extension, open Sync and click `Prepare Local Data`.

This adds missing IDs and timestamps to old browser entries. It only shows counts. It does not print titles, URLs, or notes.

After that, click `Sync Now` to upload the merged snapshot.

## Safety Notes

- Row-level security is enabled on `media_log_records`.
- Users can only read or write their own row.
- The Edge Function validates the bearer token.
- Server secrets stay in Supabase, not in the extension or iOS app.
- Sync uses JSON over HTTPS.
