# Media Log Nightly Handoff

Nightly is the only app in this repo. Its source stays in `chrome-nightly/`.

## Keep the Install Stable

Keep Nightly's manifest key and folder path. Use Reload on the existing extension. Removing an extension can remove its browser data.

Browser storage keeps `currentWeek`, `history`, `addDraft`, `userName`, and `theme`. This cleanup does not change those keys or their format.

`parkedDrafts` lists unfinished entries set aside, newest first. When Media Log opens on a different web page than the draft's URL, the open page fills the form and the draft joins this list. The Add tab offers Restore or Discard for the newest one; Restore steps through the list. An entry set aside for the page you open comes back by itself. Full backups include the list.

The Add and Edit menus offer Anime, Article, Book, Film, Game, Manga, Podcast, and TV Show. YouTube links default to Podcast. The menus are built from `SELECTABLE_TYPES` in `chrome-nightly/core.js`.

## Weeks

The current week moves to History when a new ISO week starts. There is no manual Start New Week button; it used to split one week into two History records with the same number. If a week is already in History when it rolls over, its remaining entries merge into that record.

## Notebook

Expand beside Note opens the notebook inside the popup. Its pop-out button saves the form and opens `popup.html?notebook=1` in a tab, which edits that entry's note. The page finds the entry by URL, keeps saving into it if it is set aside, and turns read-only once it is added or discarded. Notes stay plain text with Markdown, so storage, backups, and the website bridge keep the same format. Notes can hold up to 100,000 characters.

Video time reads the playing video's position from the tab Media Log was opened on. It reads nothing else from the page.

## Code Layout

- `popup.js`: popup UI, draft saving, rendering, and the transfer and notebook pages.
- `core.js`: pure data rules (weeks, entries, search, backup validation). The backup check loads this file directly.
- `notebook.js`: the editor controller, editing helpers, and the Markdown parser and renderer.

## Edit and Check

Edit metadata in `shared/media-metadata.js`. Run:

```sh
bun run sync:media-metadata
bun run verify
```

The backup check reuses Nightly's real validation and storage comparison code from `core.js` with test data. It checks entry counts, missing history, long notes, and unsafe URL rejection. The notebook check covers list editing, formatting, and safe Markdown links.

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
