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

- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

The dev server writes to `.local-sync/`, which is ignored.

## Production Sync

Deploy the Supabase backend in `supabase/`.

Setup steps are in `docs/supabase-sync.md`.

Use this endpoint in the Sync tab:

`https://<project-ref>.supabase.co/functions/v1/media-log-sync`

Use a Supabase user access token. Do not use a service key in the extension.

## Migration

Open the Sync tab and click `Prepare Local Data`.

This adds missing IDs and timestamps to older browser entries. It only reports counts, not titles, URLs, or notes.

Then click `Sync Now`.

## Release Package

Run:

`bun run package:chrome`

The Chrome Web Store zip is written to `dist/`.

The release build does not include the old local website publish bridge.
