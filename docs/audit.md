# Nightly Project Audit

Date: 2026-10-25

## Active App

The only app source is `chrome-nightly/`. Its manifest, key, popup, styles, icons, backup format, and website bridge stay in place.

Metadata source lives in `shared/media-metadata.js`. The copy inside Nightly must match it.

## Data Boundary

Logs live in browser extension storage. This cleanup changes project files only. It keeps browser data, existing backups, Git history, and the ignored `.local-sync/` data.

The removed project files have a recovery copy outside the repo.

## Checks

- Nightly syntax and manifest checks.
- Metadata examples and active-tab form checks.
- Full backup validation and exact storage comparison.
- Safe URL rejection and missing-history detection.
- Local doc links, script paths, and project layout.

Run `bun run verify`. No check opens or writes a live browser profile.

## Publishing

Website publishing still uses the website project's local bridge on port 43187. Media Log does not deploy that bridge.

See [Install and Test](install-test.md) and [Privacy](privacy.md).
