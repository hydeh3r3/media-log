# Install and Test Nightly

Nightly works as an unpacked extension in Chromium browsers such as Chrome, Arc, and Helium.

## Install

1. Open `chrome://extensions` in the browser you want to use.
2. Enable Developer mode.
3. Click Load unpacked.
4. Choose `/Users/wetbrain/Documents/workspace/media-log/chrome-nightly`.
5. Pin Media Log if you want a toolbar button.

Each browser profile has its own data. Installing the same folder does not copy your logs from another browser.

## Reload an Existing Install

Open `chrome://extensions` and click Reload for Media Log. Keep the same folder and manifest key. Do not remove and reinstall the extension as an update step.

## Save or Move All Data

1. Open Media Log and its Settings.
2. Choose Export All Data.
3. Save the JSON file outside the repo.
4. In the destination browser, open Media Log Settings.
5. Choose Import Backup. This opens the transfer page.
6. Choose Import Backup again and select the full backup file.
7. Check the verified total, archived weeks, and current-week entry count.
8. Export from the destination and compare it with the source backup.

Import replaces that profile's Media Log data. Export a destination backup first if it has entries you want to keep.

The full backup includes the current week, history, draft when present, name, and theme. A single-week export is not a full backup.

## Check the Code

Use Bun:

```sh
bun run sync:media-metadata
bun run verify
```

Verification checks Nightly's JavaScript, manifest, title and type rules, form behavior, backup format, and docs. It uses test data and does not write to browser profiles.

## Check the Popup

Open a content page and then Media Log. Check the title, URL, type, and date. Change the title or type while a page lookup is pending; your edit should stay.

Use a test browser profile if you want to add or remove sample entries.

## Publish a Week

Start the website project's local publish bridge on port 43187. Then use Publish to Website for the chosen week. Media Log keeps the week locally if the bridge is not running.

See [Title and Type Rules](media-detection-notes.md) and [Privacy](privacy.md).
