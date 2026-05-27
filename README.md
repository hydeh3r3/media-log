# Media Log

Media Log is a personal media journal with two clients:

- a Chrome extension for quick browser capture
- a SwiftUI iOS app for phone use

Both clients use the same sync shape. They can sync through Supabase in production or a local Bun server during development.

## What It Can Do

- Add media entries.
- Edit and delete current-week entries.
- Edit and delete archived entries in the iOS app.
- Keep weekly history.
- Save drafts in the Chrome extension.
- Sync current week, history, drafts, tombstones, and entry metadata after the `$2` sync unlock is active.
- Sign up, sign in, sign out, and request password reset emails through Supabase.

## Repo Map

- `chrome-extension/`: Chrome Web Store extension source.
- `iphone-app/`: SwiftUI iOS app and Xcode project.
- `supabase/`: production database migration and Edge Function.
- `scripts/`: build, lint, local sync, and verification scripts.
- `shared/`: sync protocol notes.
- `docs/`: audit, privacy, store, and backend setup notes.
- `firefox-extension/`: Firefox and Zen local-use copy with the same sync flow.

## Verify Everything

Run:

```sh
bun run verify
```

This checks the Chrome source, lints the Chrome release manifest, builds the Chrome release zip, checks the Firefox and Zen source, checks the Supabase backend files, runs a Stripe webhook smoke test, runs a local sync smoke test, and builds the iOS app for the simulator.

## Chrome Development

Load the extension from:

```text
/Users/wetbrain/Documents/workspace/media-log/chrome-extension
```

Steps:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click `Load unpacked`.
4. Select the folder above.

## Chrome Release

Run:

```sh
bun run package:chrome
```

The Chrome Web Store zip is created in `dist/`. Do not commit that zip.

The package command also verifies the zip contents against the release allowlist.

Chrome Web Store notes live in [docs/chrome-web-store.md](docs/chrome-web-store.md).

## iOS Development

Open:

```text
iphone-app/MediaLog.xcodeproj
```

Build check:

```sh
bun run check:ios
```

To install on a real iPhone, set your Apple developer team on the `MediaLog` target in Xcode, then build and run.

## Local Sync

Run:

```sh
bun run sync:dev
```

Use these settings in Chrome or iOS:

- Mode: `Local dev`
- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

The local sync file is written under `.local-sync/`, which is ignored by git.

## Production Sync

Production sync uses Supabase.

Cross-device sync is gated by a `$2` entitlement row in PostgreSQL. The clients can open a Stripe Checkout page after sign-in. Details live in [docs/paid-sync.md](docs/paid-sync.md).

Deploy:

```sh
bun run supabase:deploy
```

Then use these settings in both clients:

- Mode: `Supabase`
- Supabase URL: `https://<project-ref>.supabase.co`
- Publishable key: your Supabase publishable key
- Email: your Supabase account email

Never paste a service key into Chrome or iOS.

Full setup steps live in [docs/supabase-sync.md](docs/supabase-sync.md).

## Migration

In the Chrome extension, open Sync and click `Prepare Local Data`.

This adds missing IDs and timestamps to old local entries. It only shows counts. It does not print titles, URLs, or notes.

After that, sign in and click `Sync Now`.

## Still Manual

These steps need live accounts or private data:

- create and deploy the real Supabase project
- set Stripe checkout and webhook secrets in Supabase
- set Supabase Auth redirect URLs
- upload the Chrome release zip to the Chrome Web Store
- answer the Chrome Web Store privacy form
- run the real browser-data migration from your installed extension
- set the Apple developer team before device install
