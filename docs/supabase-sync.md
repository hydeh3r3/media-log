# Supabase Sync Setup

Supabase is the production sync path for Media Log.

Production cross-device sync is a paid feature. The unlock price is `$2`.

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

The database also stores a sync unlock row in `media_log_sync_entitlements`.

That row contains:

- the Supabase Auth user ID
- the paid sync status
- the `$2` plan ID
- the price in cents
- the currency
- payment provider references
- optional expiry time

## Auth

Use Supabase Auth for your personal account.

Chrome and iOS can sign up, sign in, sign out, and request a password reset email.

Supabase returns an access token and a refresh token after sign-in. It may also return a session after sign-up if email confirmation is off.

The iOS app stores the session in Keychain. The Chrome extension stores the session in extension storage.

Passwords are not saved.

The Edge Function checks the user token before it reads or writes data.

For password reset emails, set your Supabase Auth redirect URL before using the reset link. The clients only send the reset request.

The Edge Function also checks PostgreSQL for an active `$2` sync entitlement before it reads or writes sync data.

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

- Mode: `Supabase`
- Supabase URL: `https://<project-ref>.supabase.co`
- Publishable key: your Supabase publishable key
- Email: your Supabase account email
- User ID: `personal`

Then sign up or sign in, and sync.

The Supabase function ignores the typed User ID for production data ownership. It uses the Auth user ID from the token.

The local Bun server still uses the User ID and local token fields for local testing.

## Migration

In the Chrome extension, open Sync and click `Prepare Local Data`.

This adds missing IDs and timestamps to old browser entries. It only shows counts. It does not print titles, URLs, or notes.

After that, click `Sync Now` to upload the merged snapshot.

If sync returns `Cross-device sync requires the $2 sync unlock.`, create or activate the user's row in `media_log_sync_entitlements`.

## Safety Notes

- Row-level security is enabled on `media_log_records`.
- Users can only read or write their own row.
- Row-level security is enabled on `media_log_sync_entitlements`.
- Users can read their own sync entitlement.
- The Edge Function validates the bearer token.
- The Edge Function gates production sync on the PostgreSQL entitlement row.
- Server secrets stay in Supabase, not in the extension or iOS app.
- Service keys must never be pasted into either client.
- Sync uses JSON over HTTPS.

More paid sync notes live in `docs/paid-sync.md`.
