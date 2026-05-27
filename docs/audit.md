# Media Log Repo Audit

Date: 2026-05-26

## Repo Shape

The repo has four main areas:

- `chrome-extension`: the Chrome Manifest V3 popup.
- `firefox-extension`: the Firefox and Zen copy of the popup.
- `shared`: sync protocol notes.
- `iphone-app`: the SwiftUI companion app package.
- `supabase`: the production sync database and Edge Function.

The Chrome extension is the main product target. The Firefox folder is useful for Zen, but it is not the official store target for this goal.

The Firefox and Zen copy now follows the same sync-capable popup shape as Chrome. It uses Firefox `browser.*` APIs, keeps the local-use Gecko ID, and no longer ships the old website publish bridge permissions.

## Current Chrome Extension

The Chrome extension is a single popup app.

It has these tabs:

- Add
- This Week
- History
- Sync

It stores all user data in `chrome.storage.local`.

Current storage keys:

- `currentWeek`
- `history`
- `addDraft`
- `syncConfig`
- `syncSession`
- `syncState`
- `syncTombstones`

The popup can prefill the URL and title from the active tab. It also guesses the media type from the page URL and title.

## Data Model

The week shape is:

- `weekStart`
- `weekEnd`
- `weekNumber`
- `year`
- `entries`

Each entry has:

- `type`
- `title`
- `date`
- `createdAt`
- `updatedAt`
- `id`
- `url`, optional
- `rating`, optional
- `note`, optional

Old local entries are prepared for sync by adding stable IDs and edit timestamps. The migration UI reports counts only.

## Current Permissions

The old Chrome manifest used:

- `storage`
- `tabs`
- `clipboardWrite`
- local bridge host permissions

The release manifest now uses:

- `storage`
- `activeTab`
- optional host permission only for Supabase or a local sync endpoint

The extension does not use clipboard access today, so `clipboardWrite` should not ship.

## Publishing Gaps

The extension now has:

- tighter permissions
- a privacy note
- store listing copy
- screenshot guidance
- a repeatable release package command
- no local website bridge code in the release package
- a sync path that also works for iOS

Manual store work still remains:

- create final screenshots
- answer the Chrome Web Store privacy form
- upload the release zip

## iOS App

The iOS folder now contains an Xcode project with a SwiftUI app. It has:

- list, add, edit, and delete entry views
- editable archived history
- local persistence
- sync settings
- cloud sync with the same data model as Chrome
- Supabase email/password sign-in
- Keychain storage for the iOS sync session
- app icon assets

It still needs a developer team set in Xcode before device install, TestFlight, or App Store submission.

## Sync Path

The repo now has two sync paths:

- Local dev: `scripts/sync-dev-server.js`
- Production: `supabase/functions/media-log-sync/index.ts`

The production path uses Supabase Auth, a row owned by the signed-in user, row-level security, and a server-side merge before write.

`bun run verify` now runs a safe local sync smoke test. It starts the local sync server on a temporary port, writes one synthetic entry, reads it back, and deletes the temporary file.

Production sync is gated by a `$2` PostgreSQL entitlement row in `media_log_sync_entitlements`. Stripe Checkout creates the payment session, and a Stripe webhook activates the entitlement after payment.
