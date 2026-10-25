# Shared Metadata

`media-metadata.js` is the source for Nightly's title and media-type rules. It reads page signals collected by the browser and returns a suggested title and type.

`media-detection-fixtures.json` holds the examples used by the metadata check.

After editing the source, run:

```sh
bun run sync:media-metadata
bun run verify
```

The copy command writes only `chrome-nightly/media-metadata.js`. Nightly keeps its own entry storage, week logic, backup validation, and popup in `chrome-nightly/popup.js`.

Private logs and backup files do not belong here.
