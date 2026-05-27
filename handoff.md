# Media Log Handoff

This repo is now the standalone Media Log product.

It no longer depends on the old website publish bridge. The Chrome release path, iOS app, Supabase backend, and local sync server live in this repo.

## Current Product Shape

- `chrome-extension/` is the Chrome Web Store target.
- `firefox-extension/` is the Firefox and Zen local-use copy.
- `iphone-app/` is the SwiftUI iOS companion app.
- `supabase/` is the production sync backend.
- `scripts/sync-dev-server.js` is the local sync backend.
- `shared/sync-protocol.md` documents the sync shape.

## Current Chrome Extension

The Chrome extension is a Manifest V3 popup app.

It supports:

- active tab title and URL capture
- type inference
- add, edit, and delete for this week
- history view
- current-week JSON export
- local sync
- Supabase sync
- local data prep for migration

Release packaging is done with:

```sh
bun run package:chrome
```

The release zip is written to `dist/`, which is ignored.

## Current iOS App

The iOS app is a SwiftUI app in `iphone-app/MediaLog.xcodeproj`.

It supports:

- current-week list
- add, edit, and delete
- archived history
- edit and delete for archived entries
- local JSON persistence
- local sync
- Supabase sync
- Keychain storage for sync credentials

Build check:

```sh
bun run check:ios
```

## Current Sync Path

The production backend is Supabase:

- `supabase/migrations/20260526173000_create_media_log_records.sql`
- `supabase/functions/media-log-sync/index.ts`

Production sync is gated by a `$2` PostgreSQL entitlement row in `media_log_sync_entitlements`. The repo now includes a Stripe Checkout function and Stripe webhook function, but the live Stripe secrets still need to be set in Supabase.

The local backend is:

- `scripts/sync-dev-server.js`

The one-command verification path runs a safe sync smoke test:

```sh
bun run verify
```

That command also checks the Firefox and Zen source. The sync smoke test writes one synthetic entry to a temporary local server and reads it back. It does not use private log data.

## Storage Shape

The synced snapshot contains:

- `currentWeek`
- `history`
- `addDraft`
- `tombstones`

Entries include stable IDs, creation timestamps, and update timestamps. Merge logic uses IDs and `updatedAt`.

## Migration Path

Use the Chrome extension Sync tab:

1. Click `Prepare Local Data`.
2. Review the count summary.
3. Sign in to Supabase.
4. Click `Sync Now`.

The migration UI reports counts only. It does not print private titles, URLs, or notes.

## Remaining Manual Work

These steps need user accounts, private browser data, or store access:

- create and link the real Supabase project
- deploy the Supabase migration and Edge Function
- set Supabase Auth redirect URLs
- run the real Chrome storage migration
- upload the Chrome release zip to the Chrome Web Store
- fill the Chrome Web Store privacy form
- set the Apple developer team in Xcode before device install

## Useful Docs

- [README.md](README.md)
- [docs/audit.md](docs/audit.md)
- [docs/supabase-sync.md](docs/supabase-sync.md)
- [docs/chrome-web-store.md](docs/chrome-web-store.md)
- [docs/privacy.md](docs/privacy.md)
