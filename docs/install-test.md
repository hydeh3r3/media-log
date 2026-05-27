# Install And Test Guide

Use this guide when you want to try Media Log on Chrome, Firefox or Zen, and iOS.

Run the full local check first:

```sh
bun run verify
```

That command checks the Chrome package, Firefox source and lint, Supabase backend files, safe migration flow, Stripe webhook rules, local sync merge flow, iOS simulator build, and iOS release readiness.

## Chrome Development Install

Load this folder:

```text
/Users/wetbrain/Documents/workspace/media-log/chrome-extension
```

Steps:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click `Load unpacked`.
4. Pick the folder above.
5. Pin Media Log in the toolbar.

Use the Sync tab to prepare old browser data, sign in, unlock paid sync, and sync.

## Chrome Release Package

Build the Chrome Web Store zip:

```sh
bun run package:chrome
```

The zip is written to `dist/`.

The package check only allows extension files in the zip. It blocks local sync files, browser storage exports, Supabase code, scripts, and secret-looking values.

Build the Chrome Web Store image assets:

```sh
bun run build:chrome-store-assets
```

The generated screenshots and small promotional image live in `store-assets/chrome/`.

The screenshots are `1280x800`.

The small promotional image is `440x280`.

Manual Chrome Web Store work still remains:

- upload the zip
- add screenshots
- add the small promotional image
- answer the privacy form with `docs/chrome-web-store-privacy.md`
- review the store listing text in `docs/chrome-web-store.md`

## Firefox And Zen Install

Zen currently uses the Firefox extension folder as a temporary add-on.

Load this manifest:

```text
/Users/wetbrain/Documents/workspace/media-log/firefox-extension/manifest.json
```

Steps:

1. Open Zen or Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on`.
4. Pick the manifest file above.
5. Open the Media Log toolbar button.

Temporary add-ons unload when Zen or Firefox restarts. Reload the manifest from `about:debugging` after a restart.

Check the Firefox and Zen source with:

```sh
bun run check:firefox
bun run lint:firefox
```

## iOS Install

Open the Xcode project:

```text
/Users/wetbrain/Documents/workspace/media-log/iphone-app/MediaLog.xcodeproj
```

Build the simulator target with:

```sh
bun run check:ios
```

Run the release-readiness check with:

```sh
bun run check:ios-release
```

To install on a real iPhone, set your Apple developer team on the `MediaLog` target in Xcode. Then build and run from Xcode.

App Store and TestFlight notes live in `docs/app-store.md`.

## Local Dev Sync

Start the local sync server:

```sh
bun run sync:dev
```

Use these settings in Chrome, Firefox or Zen, and iOS:

- Mode: `Local dev`
- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

Local dev sync is for testing only. It is not pay gated. It writes files under `.local-sync/`, which is ignored by git.

Run the local merge smoke test with:

```sh
bun run check:sync
```

## Production Sync

Production sync uses Supabase, which stores data in PostgreSQL.

Deploy with:

```sh
bun run supabase:deploy
```

Production sync requires:

- a Supabase project
- Supabase Auth email/password sign-in
- Supabase Auth redirect URLs for password reset
- the `media_log_records` PostgreSQL table
- the `media_log_sync_entitlements` PostgreSQL table
- the `media-log-sync` Edge Function
- the `media-log-checkout` Edge Function
- the `media-log-stripe-webhook` Edge Function

Set these Supabase function secrets before paid checkout:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `MEDIA_LOG_CHECKOUT_SUCCESS_URL`
- `MEDIA_LOG_CHECKOUT_CANCEL_URL`

Never put a Supabase service key, Stripe secret key, or webhook secret in Chrome, Firefox, Zen, or iOS.

## Paid Sync

Cross-device sync is a `$2` unlock.

The unlock lives in PostgreSQL:

```text
public.media_log_sync_entitlements
```

The client opens Stripe Checkout after sign-in. The Stripe webhook writes the paid entitlement row after payment succeeds.

The Supabase sync function checks the signed-in user and the PostgreSQL entitlement row before it reads or writes sync data. If the row is missing or inactive, sync returns `402 Payment Required`.

Check the safe webhook rules with:

```sh
bun run check:stripe
```

## Migration

In the browser extension, open the Sync tab and click `Prepare Local Data`.

This adds missing IDs and timestamps to old entries. It reports counts only. It does not print titles, URLs, or notes.

After that, sign in, unlock paid sync, and click `Sync Now`.

Check the safe migration flow with:

```sh
bun run check:migration
```

## Manual Steps Left

These steps still need live accounts, private browser data, or store access:

- create and link the real Supabase project
- set Stripe checkout and webhook secrets in Supabase
- set Supabase Auth redirect URLs
- choose the App Store paid-sync route before App Review
- run the real browser-data migration from your installed extension
- pay through Stripe Checkout or add your manual entitlement row
- upload the Chrome release zip to the Chrome Web Store
- answer the Chrome Web Store privacy form with `docs/chrome-web-store-privacy.md`
- set the Apple developer team before installing on a real iPhone
