# Zen Extension Migration Report

## Result

The Zen extension now matches Chrome Nightly. The popup, styles, icons, website publish flow, history search, themes, and data transfer tools are the same.

The only required difference is the extension API name:

- Chrome Nightly uses `chrome.*`.
- Zen uses `browser.*`.

## Data Backup

The verified Zen import file is:

`/Users/wetbrain/Downloads/media-log-ZEN-IMPORT-verified-weeks-12-32.json`

It contains:

- 41 current-week entries
- 904 archived entries
- 20 archived weeks
- 945 total entries
- saved name and theme
- no saved draft

The file is private and has owner-only permissions. It is outside this repo.

## Load and Import in Zen

1. Open Zen.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Pick `/Users/wetbrain/Documents/workspace/media-log/firefox-extension/manifest.json`.
5. Open Media Log from the toolbar.
6. Click the gear button.
7. Click **Import Backup**.
8. A full transfer tab opens. Click **Import Backup** again in that tab.
9. Pick `/Users/wetbrain/Downloads/media-log-ZEN-IMPORT-verified-weeks-12-32.json`.
10. Wait for this result: `Verified 945 entries. Archived Weeks 12-31; current Week 32 has 41 entries.`
11. Close the transfer tab. Open **History** and check that it shows 20 archived weeks.

The transfer tab stays open while Zen shows the file picker. Media Log reads the saved data back before it says the import is verified.

The import replaces only Media Log data in Zen. It does not copy or change cookies, passwords, other extensions, or normal browser history.

Temporary add-ons unload when Zen restarts. Load the manifest again after a restart. The Media Log data stays in the Zen profile.

## Checks

- Chrome Nightly and Zen parity check passed.
- The real 945-entry backup passed both import validators.
- The read-back test rejects an import when archived weeks are missing.
- Firefox lint passed with no errors, warnings, or notices.
- The Data Transfer screen passed browser QA.
- `bun run verify` passed, including backend tests and Debug and Release iOS builds.
