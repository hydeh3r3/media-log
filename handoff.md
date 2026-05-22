# Media Log Standalone Handoff

This folder is the starting point for turning the current media logging tool into:

- a standalone Chrome extension
- an iPhone app
- a shared data model that both apps can use

The current working extension lives in `extension/` at the repo root. I copied it into `media-log-standalone/chrome-extension/` so the standalone work can begin without disturbing the current website workflow.

## Current Goal

The tool logs weekly media consumption. It lets you save items like anime, manga, articles, books, films, games, podcasts, music, and TV shows. At the end of the week, it can publish the week into the blog's media log pipeline.

The current version is useful, but it is still tied to this website repo. The standalone version should become its own product with its own storage, sync, and publish flow.

## Current Files

Current extension source:

- `extension/manifest.json`
- `extension/popup.html`
- `extension/popup.css`
- `extension/popup.js`
- `extension/icons/icon16.png`
- `extension/icons/icon48.png`
- `extension/icons/icon128.png`

Copied standalone seed:

- `media-log-standalone/chrome-extension/manifest.json`
- `media-log-standalone/chrome-extension/popup.html`
- `media-log-standalone/chrome-extension/popup.css`
- `media-log-standalone/chrome-extension/popup.js`
- `media-log-standalone/chrome-extension/icons/`

Website-side scripts the extension currently depends on:

- `scripts/publish-bridge.js`
- `scripts/log-import.js`
- `scripts/log-generate.js`
- `scripts/lib/log-schema.js`
- `scripts/lib/post-generator.js`
- `scripts/lib/week.js`
- `scripts/lib/x-ready.js`

Generated log files live in:

- `logs/YYYY-wNN.yaml`

Generated English posts live in:

- `src/content/posts/en/media-log-YYYY-wNN.md`

Turkish posts are separate and currently live in:

- `src/content/posts/tr/media-log-YYYY-wNN.md`

## Current Chrome Extension

The current extension is a Manifest V3 Chrome extension.

Manifest details:

- Name: `Media Log`
- Version: `1.0.0`
- Permissions: `storage`, `tabs`, `clipboardWrite`
- Host permissions:
  - `http://127.0.0.1:43187/*`
  - `http://localhost:43187/*`

The popup has three tabs:

- `Add`
- `This Week`
- `History`

The extension stores all data in `chrome.storage.local`.

## Current User Flow

### Add

The Add tab lets the user create a media entry.

Fields:

- URL, optional
- Title, required
- Type
- Date, required
- Rating, optional, 1 to 10
- Note, optional

The popup tries to prefill URL and title from the active browser tab through `chrome.tabs.query`.

It also tries to infer the media type from the current tab URL and title.

Examples:

- Manga sites become `manga`
- Anime streaming sites become `anime`
- Substack, LessWrong, Medium, arXiv, OpenAI, Anthropic, Gwern, and blog pages become `article`
- Letterboxd becomes `film`
- Goodreads and StoryGraph become `book`
- Spotify, Apple Podcasts, Overcast, and YouTube can become `podcast` or `music`
- Steam, itch.io, and Backloggd become `game`

### This Week

The This Week tab shows the current ISO week.

It supports:

- viewing entries
- editing entries
- deleting entries
- publishing the current week to the website
- exporting the current week as JSON
- starting a new week

When the ISO week changes, the extension archives the stale current week into history and starts a new current week.

### History

The History tab shows archived weeks.

It supports:

- viewing previous weeks
- publishing archived weeks to the website

## Current Entry Types

The extension knows these types:

- `manga`
- `anime`
- `film`
- `tv`
- `music`
- `game`
- `book`
- `article`
- `podcast`
- `youtube`

Important mismatch:

- `youtube` exists in the shared website schema.
- `youtube` is not currently selectable in the popup dropdown.
- YouTube URLs are currently scored as `podcast`, with a possible `music` score if the title looks like music.

This should be cleaned up in the standalone product.

## Current Storage Shape

The extension stores:

- `currentWeek`
- `history`
- `addDraft`

`currentWeek` shape:

- `weekStart`: string, `YYYY-MM-DD`
- `weekEnd`: string, `YYYY-MM-DD`
- `weekNumber`: number
- `year`: number
- `entries`: array of entries

Entry shape:

- `type`: string
- `title`: string
- `date`: string, `YYYY-MM-DD`
- `createdAt`: ISO timestamp
- `url`: optional string
- `rating`: optional number, 1 to 10
- `note`: optional string

Export shape:

- `week`: number
- `year`: number
- `start`: string, `YYYY-MM-DD`
- `end`: string, `YYYY-MM-DD`
- `entries`: array of entries

Website YAML log shape:

- `week`: number
- `year`: number
- `start`: string, `YYYY-MM-DD`
- `end`: string, `YYYY-MM-DD`
- `entries`: array of cleaned entries

The website YAML does not keep `createdAt`.

## Current Publish Flow

The Chrome extension does not write files directly.

It sends data to a local bridge server:

- `http://127.0.0.1:43187/publish`
- fallback: `http://localhost:43187/publish`

To run the bridge:

- `bun run publish:bridge`

The bridge is implemented in:

- `scripts/publish-bridge.js`

The bridge does this:

1. Accepts a JSON payload from the extension.
2. Validates every entry with `validateEntry`.
3. Cleans entry fields.
4. Sorts entries by date, type, and title.
5. Writes `logs/YYYY-wNN.yaml`.
6. Generates an English weekly Markdown post.
7. Builds an X-ready post text.
8. Returns paths, title, slug, URL, and X text.

The publish endpoint returns:

- `ok`
- `title`
- `slug`
- `logPath`
- `postPath`
- `url`
- `xText`

Current limitation:

- The bridge generates the English post only.
- Turkish post generation is still handled elsewhere in the website workflow.

## Current Website Generation

The generator reads a weekly YAML log and writes an English Markdown post.

Post title format:

- `The Weekly Praegustator (20 - 26 April '26)`

Slug format:

- `media-log-YYYY-wNN`

Frontmatter includes:

- `title`
- `tags`
- `date`
- `updated`

The post body begins with:

- `This week I consumed ...`
- `<!--more-->`

Entries are grouped by day with `## Day Month` headings.

Entry format:

- `Type/ Title`
- If URL exists, title becomes a Markdown link.
- If rating exists, rating appears as `(N/10)`.
- Notes are written below the entry.

## Current Import Flow

The extension can export a week as JSON.

The website can import that JSON with:

- `bun run log:import <path-to-json>`

That import path writes the YAML log files. This is useful as a backup path if the local bridge is not running.

## Current Weak Spots

The current tool works, but it is not yet standalone.

Main issues:

- Chrome-only storage through `chrome.storage.local`
- No cloud sync
- No user account
- No iPhone app
- Publish flow depends on a local server inside this website repo
- English generation is automated, but Turkish generation is not part of the extension flow
- Type inference and type schema are duplicated between extension and website scripts
- There is no shared package for the media log schema
- No tests
- No migration tool for moving old `chrome.storage.local` data into a new backend
- No proper app icon or app identity beyond the simple extension icon set

## Standalone Product Direction

The standalone project should separate the logging product from the blog.

Suggested shape:

- `chrome-extension/`: Chrome extension UI and browser tab capture
- `iphone-app/`: iOS app source
- `shared/`: shared schema, week logic, validation, type labels, and import/export helpers
- `backend/`: optional API and sync service, if we decide to use one

This folder currently includes:

- `chrome-extension/`
- `iphone-app/`
- `shared/`

No backend folder exists yet because the storage/sync choice is still open.

## Shared Logic To Extract First

Move these concepts into shared code before building both clients deeply:

- entry types
- type labels
- validation
- ISO week logic
- week bounds
- date formatting
- storage schema
- JSON export shape
- import/export helpers
- type inference rules where possible

Current source locations:

- `extension/popup.js`
- `scripts/lib/log-schema.js`
- `scripts/lib/week.js`

The current code duplicates concepts across browser and Node scripts. The standalone version should not duplicate them.

## Chrome Extension Plan

The standalone Chrome extension should keep:

- active tab prefill
- URL and title capture
- type inference
- weekly grouping
- add/edit/delete
- history
- JSON export

It should change:

- use a shared schema package
- support sync or an export/import backup
- remove hard dependency on `scripts/publish-bridge.js`
- add a real publish adapter later
- add a settings screen
- add backup/export all data
- add import data

Possible publish modes:

- local bridge to this website repo, current behavior
- GitHub commit API
- backend API
- manual JSON export
- direct share sheet from iPhone app

## iPhone App Plan

The iPhone app should start simple.

First version:

- Add entry
- Edit entry
- Delete entry
- This Week view
- History view
- Export week as JSON
- Import JSON

Likely iOS stack:

- SwiftUI
- local storage with SwiftData or SQLite
- share extension later, not first

The iPhone app cannot use Chrome's active tab API. It needs its own capture flow.

Possible capture flows:

- manual entry
- iOS share sheet extension
- clipboard prefill
- Safari extension later

Best first iPhone scope:

- manual entry
- share sheet support after the base app works

## Data Sync Choices

We need to choose one of these later:

1. Local only
   - simplest
   - Chrome and iPhone do not sync

2. iCloud for iPhone plus browser export/import
   - good for iPhone
   - weak for Chrome

3. Backend API
   - best cross-platform sync
   - more work

4. GitHub as storage
   - direct to repo
   - useful because the final target is the blog
   - needs auth and careful commit handling

5. Dropbox or file sync
   - could match the current writing workflow
   - needs more design

My recommendation:

- Start with local storage plus export/import.
- Extract shared schema first.
- Add sync only after the Chrome and iPhone UIs are both usable.

## Migration Plan

To move current extension data into the standalone app:

1. Add an "Export all data" action to the current extension.
2. Export `currentWeek`, `history`, and `addDraft`.
3. Create an importer in the standalone Chrome extension.
4. Create an importer in the iPhone app.
5. Validate all entries with the shared schema.
6. Keep old exported JSON files as backups.

## Questions To Answer Later

- Should Chrome and iPhone sync automatically?
- Should the app publish directly to the website repo?
- Should Turkish post generation become part of the publish flow?
- Should YouTube be its own selectable type?
- Should the product track partial progress, like episodes watched but not finished?
- Should ratings be required or optional forever?
- Should there be separate fields for season, episode, chapter, author, publication, and source?
- Should notes be private, public, or both?

## Commands

Run the current local bridge:

- `bun run publish:bridge`

Import an exported week JSON into the website:

- `bun run log:import <path-to-json>`

Generate a weekly post from YAML:

- `bun run log:generate --week <week-number> --year <year>`

Build the website:

- `bun run build`

## Safe Next Step

The safest first engineering step is to create a shared schema module and make the copied Chrome extension use it.

Do not start with sync. Sync will force product choices too early.

Start with:

1. Shared media log schema.
2. Shared ISO week logic.
3. Standalone Chrome extension using the shared module.
4. iPhone app with the same data model.
5. Import/export between both.
6. Publishing after the logging app is stable.
