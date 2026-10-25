# Media Log Nightly

Media Log Nightly is a personal media journal for Chromium browsers, including Chrome, Arc, and Helium.

## Features

- Capture the active tab's title and URL.
- Suggest a media type and keep your manual edits.
- Add, edit, and delete entries in the current week.
- Keep weekly history and saved drafts.
- Export and import a full backup.
- Publish a chosen week through the local website bridge.
- Set your name and theme.

## Project Layout

- `chrome-nightly/`: the only extension app.
- `shared/`: metadata source and examples.
- `scripts/`: Nightly checks and metadata copying.
- `docs/`: install, privacy, and behavior notes.
- `brand/`: logo source files.

## Install or Reload

Open `chrome://extensions` in your browser. Enable Developer mode, choose Load unpacked, and select:

```text
/Users/wetbrain/Documents/workspace/media-log/chrome-nightly
```

For an existing install, click Reload. Keep the same folder and manifest key so the extension keeps its ID and stored data.

See [Install and Test](docs/install-test.md), [Privacy](docs/privacy.md), and [Title and Type Rules](docs/media-detection-notes.md).

## Check Changes

Use Bun for project commands:

```sh
bun run sync:media-metadata
bun run verify
```

The checks cover syntax, the manifest, metadata, form behavior, full backups, and local docs.

## Your Data

Entries live in the browser profile's extension storage. Project cleanup does not change that storage. Full backup files include the current week, history, draft when present, name, and theme.

Use Export All Data before moving to another browser. Use Import Backup in the new browser. Keep personal backup files outside this repo.

The existing `.local-sync/` data is preserved and ignored by Git.

## Website Publishing

Nightly sends the chosen week to the local website bridge at port 43187 when you click Publish to Website. Run that bridge from your website project. Media Log does not start or deploy it.
