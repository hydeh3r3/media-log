# Notes: Firefox Extension Parity and History

## Missing Week Follow-up

- Verified Zen storage after the user's import: current `2026-W32` has 0 entries; history has 10 weeks, `2026-W21` through `2026-W12`.
- Verified prepared backup: current `2026-W32` has 41 entries; history has 20 weeks, `2026-W31` through `2026-W12`; 945 total entries.
- Root cause: the old popup-only file input flow did not complete in Zen. It left the old IndexedDB data unchanged.
- Fix direction: launch import in a full extension tab, then compare every current/history week and entry count after the storage write.
- Completed import result: Zen displayed the green 945-entry verification result. It now matches the prepared backup with 20 archived weeks (`2026-W12` through `2026-W31`) and 41 entries in current `2026-W32`.
- Disk check after import: Zen's storage database changed at `2026-08-06 21:47:04`; the current-week and history records grew from 142/79,541 bytes to 5,532/133,886 bytes.

- The first Zen import still showed only Weeks 12 through 21, while Chrome Nightly had Weeks 22 through 31 and current Week 32.
- The backup itself was complete. Zen's popup file-picker flow had not written it.

## Sources

### Workspace comparison
- Chrome Nightly and Firefox had different products behind the same Media Log name.
- Chrome Nightly used the local website publish bridge on port 43187.
- Firefox used the Chrome Stable paid Supabase sync flow.
- Popup HTML, CSS, JavaScript, and manifests were not at parity.
- Icon assets already matched byte for byte.

### Live browser storage
- The source extension ID is `lebiipcpljojaojhmflmpobdfjpofclf`.
- Its data is under the Arc Chromium profile.
- Available keys are `currentWeek`, `history`, `theme`, and `userName`.
- No `addDraft` value is currently saved.
- Firefox is not installed. Zen is installed and has used the Firefox extension folder.

## Synthesized Findings

### Parity
- Firefox must use Chrome Nightly UI and behavior with only browser-required API and manifest differences.
- A parity check should normalize `chrome.*` to `browser.*` and ignore Gecko-only manifest fields.

### Transfer
- Browser extension storage cannot be shared directly between Chromium and Firefox.
- A full JSON backup is the safest portable transfer.
- The backup must include current week, history, draft when present, name, and theme.
- The importer must limit file size and validate every field before replacing local Media Log data.
- The private backup must stay outside git and the extension source tree.
- The private backup contains 945 entries: 41 in the current week and 904 in 20 archived weeks.
- The backup path is `/Users/wetbrain/Downloads/media-log-full-backup-2026-08-06.json`.

### Validation
- Chrome Nightly and Firefox popup HTML and CSS match exactly.
- JavaScript matches after normalizing `chrome.*` and `browser.*`.
- Manifest differences are limited to the Chrome key and Gecko settings.
- Firefox lint passes with no errors, warnings, or notices.
- The real 945-entry backup passes both import validators.
- Unsafe URL schemes are rejected.
- Browser QA confirmed the Settings and Data Transfer layout.
