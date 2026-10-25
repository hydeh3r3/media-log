# Nightly-Only Cleanup Plan

Status: approved and applied on 2026-10-25. The listed paths were moved to a recovery folder outside the repo.

Keep `chrome-nightly/` as the only app. Keep its capture form, weekly history, full backup import and export, settings, and website publish feature.

## Removed Folders

These paths are inside this Media Log folder:

- `firefox-extension/`: Firefox and Zen app source.
- `iphone-app/`: iOS source, assets, and Xcode project.
- `chrome-stable/`: Chrome Web Store app source.
- `store-assets/`: Chrome Web Store pictures and screenshots.
- `dist/`: built store ZIP files, staged release, and store asset build files.
- `browser-fixes/`: Zen-only toolbar style.
- `supabase/`: local source for the old paid browser and iOS sync service.
- `scripts/fixtures/`: the Zen sidebar test page.

## Removed Files

- `firefox_migration_report.md`
- `shared/sync-protocol.md`
- `docs/app-store.md`
- `docs/chrome-web-store.md`
- `docs/chrome-web-store-privacy.md`
- `docs/paid-sync.md`
- `docs/supabase-sync.md`
- `docs/sync-backend-options.md`
- `docs/zen-sidebar-fix.md`
- `docs/zen-sidebar-notes.md`
- `scripts/build-chrome-release.js`
- `scripts/build-chrome-store-assets.js`
- `scripts/check-ios-release.js`
- `scripts/check-supabase-backend.js`
- `scripts/media-metadata-smoke.swift`
- `scripts/migration-smoke-test.js`
- `scripts/nightly-firefox-parity-test.js`
- `scripts/stripe-webhook-smoke-test.js`
- `scripts/sync-dev-server.js`
- `scripts/sync-smoke-test.js`
- `scripts/verify-chrome-package.js`
- `scripts/zen-sidebar-smoke.js`

## Updated Files

- Make `package.json` checks and scripts target Nightly only.
- Make metadata copying and form tests target Nightly only.
- Update the extension lint and docs checks for Nightly.
- Remove the iOS-only HTML reader and its tests from the shared metadata code.
- Update the README, shared notes, install guide, privacy notes, audit, handoff, and project notes for Nightly.
- Keep `shared/` for metadata source and fixtures. Keep `brand/` and Nightly's icons.

## Data and Recovery

A full project archive and copies of local and browser Media Log data were saved outside the repo before removal. Git history, Nightly's folder, browser extension storage, existing backups, and `.local-sync/` data are preserved.

Protected Nightly files, Arc storage, and local data matched their original hashes. Helium added new entries while cleanup ran; a record comparison confirmed that none of its existing logged entries were lost.

This plan only changes local project files. It does not unpublish store listings, change hosted services, remove installed extensions, or delete cloud or browser data.

The cutover is complete. Nightly checks and full backup validation passed. No build paths for the removed apps remain.
