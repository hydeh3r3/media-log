# Chrome Web Store Prep

## Release Command

Run:

`bun run package:chrome`

The release zip is written to `dist/`.

Do not commit the zip. It is ignored on purpose.

## Required Manual Items

Before upload, prepare:

- 128x128 icon
- screenshots of Add, This Week, History, and Sync
- a short description
- a full description
- privacy answers for the Chrome Web Store form

## Short Description

Media Log helps you save what you read, watch, play, and listen to each week.

## Full Description

Media Log is a personal weekly media journal.

Use it to save articles, manga, anime, films, TV shows, music, games, books, and podcasts. The extension can prefill the current tab title and URL, group entries by ISO week, keep a history, and sync with the companion iOS app when you connect a sync endpoint.

Your data stays in browser storage unless you set up sync. Sync uses the endpoint and token you choose. The production sync path uses Supabase Auth, row-level security, and the `media-log-sync` Edge Function.

## Permission Notes

The release extension should request:

- `storage`, to save the media log in the browser.
- `activeTab`, to read the current tab title and URL only when the popup is opened.
- optional host access for the sync endpoint chosen by the user.

The release build must not include the old local website bridge host permissions.
