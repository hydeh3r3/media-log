# Media Log Repo Audit

Date: 2026-05-26

## Current Shape

The repo has four main areas:

- `chrome-extension`: the Chrome Manifest V3 popup.
- `firefox-extension`: the Firefox and Zen copy of the popup.
- `shared`: notes for shared data logic.
- `iphone-app`: a placeholder for the future iOS app.

The Chrome extension is the main product target. The Firefox folder is useful for Zen, but it is not the official store target for this goal.

## Current Chrome Extension

The Chrome extension is a single popup app.

It has these tabs:

- Add
- This Week
- History

It stores all user data in `chrome.storage.local`.

Current storage keys:

- `currentWeek`
- `history`
- `addDraft`

The popup can prefill the URL and title from the active tab. It also guesses the media type from the page URL and title.

## Data Model

The current week shape is:

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
- `url`, optional
- `rating`, optional
- `note`, optional

For cloud sync, entries also need stable IDs and edit timestamps.

## Current Permissions

The old Chrome manifest used:

- `storage`
- `tabs`
- `clipboardWrite`
- local bridge host permissions

Publishing to the Chrome Web Store needs tighter permissions. The release target should use:

- `storage`
- `activeTab`
- optional host permission only for the chosen sync endpoint

The extension does not use clipboard access today, so `clipboardWrite` should not ship.

## Publishing Gaps

The extension is not ready for the Chrome Web Store yet because it needs:

- tighter permissions
- a privacy note
- store listing copy
- screenshot guidance
- a repeatable release package command
- no local website bridge code in the release package
- a cloud sync path that also works for iOS

## iOS Gap

The iOS folder is only a README. It needs a SwiftUI app with:

- list, add, edit, and delete entry views
- local persistence
- sync settings
- cloud sync with the same data model as Chrome

## Sync Gap

There is no backend today. The best next step is a small HTTPS JSON sync API. Chrome and iOS can both use it. A local Bun server can be used for safe development before real credentials exist.
