# Media Log Firefox and Zen Extension

This folder is the Firefox and Zen version of the Media Log extension.

It has the same popup, storage, active tab prefill, weekly history, JSON export, migration prep, and sync flow as the Chrome extension.

It uses Firefox WebExtension APIs, so load this folder in Firefox or Zen, not Chrome.

The extension stores entries in the browser. When sync is enabled, it sends data to the sync endpoint you choose.

Firefox's manifest declares authentication info, browsing activity, and website content because saved entries can include account sign-in data, URLs, page titles, and notes you choose to sync.

## Load in Zen

1. Open Zen.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on`.
4. Select `/Users/wetbrain/Documents/workspace/media-log/firefox-extension/manifest.json`.
5. Open the Media Log toolbar button.

Temporary add-ons stay loaded until Zen restarts. After a restart, repeat the same load step.

## Dev Sync

Run the local sync server from the repo root:

`bun run sync:dev`

Use these settings in the Sync tab:

- Mode: `Local dev`
- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

The dev server writes to `.local-sync/`, which is ignored.

## Production Sync

Deploy the Supabase backend in `supabase/`.

Setup steps are in `docs/supabase-sync.md`.

Cross-device sync requires the `$2` sync unlock. The unlock is stored in PostgreSQL by the Supabase backend.

Use these settings in the Sync tab:

- Mode: `Supabase`
- Supabase URL: `https://<project-ref>.supabase.co`
- Publishable key: your Supabase publishable key
- Email: your Supabase account email
- Password: your Supabase account password

Click `Sign Up` if you need a new account. If Supabase asks you to confirm your email, confirm it and then click `Sign In`.

After sign-in, click `Unlock Sync ($2)` to open Stripe Checkout.

After payment, click `Sync Now`.

Use `Reset Password` to send a Supabase password reset email. Supabase must have an Auth redirect URL set before the reset link can finish the password change.

Do not use a service key in the extension. The password is used only for sign-in and is not saved.

If sync says `Cross-device sync requires the $2 sync unlock.`, finish checkout or activate the user's sync entitlement in Supabase.
