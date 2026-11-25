# Shared Metadata

`media-metadata.js` is the source for Nightly's title and media-type rules. It reads page signals collected by the browser and returns a suggested title and type.

`media-detection-fixtures.json` holds the examples used by the metadata check.

After editing the source, run:

```sh
bun run sync:media-metadata
bun run verify
```

The copy command writes only `chrome-nightly/media-metadata.js`. Nightly keeps its week logic and backup validation in `chrome-nightly/core.js`, and its popup in `chrome-nightly/popup.js`.

Site title cleanup lives in the `titleRules` table in `media-metadata.js`. Add a row there for a new site, then add examples to the fixtures.

Private logs and backup files do not belong here.
