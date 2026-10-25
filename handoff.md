# Media Log Nightly Handoff

Nightly is the only app in this repo. Its source stays in `chrome-nightly/`.

## Keep the Install Stable

Keep Nightly's manifest key and folder path. Use Reload on the existing extension. Removing an extension can remove its browser data.

Browser storage keeps `currentWeek`, `history`, `addDraft`, `userName`, and `theme`. This cleanup does not change those keys or their format.

The Add and Edit menus offer Anime, Article, Book, Film, Game, Manga, Podcast, and TV Show. YouTube links default to Podcast.

## Edit and Check

Edit metadata in `shared/media-metadata.js`. Run:

```sh
bun run sync:media-metadata
bun run verify
```

The backup check reuses Nightly's real validation and storage comparison code with test data. It checks entry counts, missing history, and unsafe URL rejection.

## Backups and Moving Browsers

Open Settings and choose Export All Data. Import that full file in the destination browser, then export again to compare the result. A source backup alone does not prove that an import finished.

Keep private logs and backups outside Git. The existing local data and browser profile storage are preserved.

## Website Bridge

The current and archived week views can send a chosen week to `http://127.0.0.1:43187/publish` or `http://localhost:43187/publish`. That bridge lives in the website project.

## Guides

- [Install and Test](docs/install-test.md)
- [Privacy](docs/privacy.md)
- [Title and Type Rules](docs/media-detection-notes.md)
- [Project Audit](docs/audit.md)
