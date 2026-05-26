# Media Log Chrome Extension

This is the Chrome Web Store target for Media Log.

It lets you:

- add media entries from the current tab
- edit and delete this week's entries
- archive weeks into history
- export a week as JSON
- sync with the iOS app through a sync endpoint

## Local Development

Load this folder in Chrome:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click `Load unpacked`.
4. Select `/Users/wetbrain/Documents/workspace/media-log/chrome-extension`.

## Dev Sync

Run:

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

Use these settings in the Sync tab:

- Mode: `Supabase`
- Supabase URL: `https://<project-ref>.supabase.co`
- Publishable key: your Supabase publishable key
- Email: your Supabase account email
- Password: your Supabase account password

Click `Sign Up` if you need a new account. If Supabase asks you to confirm your email, confirm it and then click `Sign In`.

After sign-in, click `Sync Now`.

Use `Reset Password` to send a Supabase password reset email. Supabase must have an Auth redirect URL set before the reset link can finish the password change.

Do not use a service key in the extension. The password is used only for sign-in and is not saved.

## Migration

Open the Sync tab and click `Prepare Local Data`.

This adds missing IDs and timestamps to older browser entries. It only reports counts, not titles, URLs, or notes.

Then click `Sync Now`.

## Release Package

Run:

`bun run package:chrome`

The Chrome Web Store zip is written to `dist/`.

The release build does not include the old local website publish bridge.
