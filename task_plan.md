# Task Plan: Restore Original Title Capture

## Goal

Revert only the new title collection and rewriting behavior. Keep media-type detection, YouTube's Podcast default, manual edits, and the Zen sidebar fix.

## Phases

- [x] Compare the original browser and iOS behavior with the recent changes.
- [x] Add failing tests for exact browser titles and immediate capture.
- [x] Remove title cleanup, metadata-title replacement, and season/episode formatting.
- [x] Restore manual iOS titles while keeping type lookup.
- [x] Complete native tests, browser package checks, and iOS builds.

## Status

Complete locally. All 50 shared cases, browser form checks, native smoke tests, and the full repo verification pass, including iOS Debug and Release builds. Reload the extensions or rebuild iOS to activate the rollback. Existing saved entries are unchanged. The Firefox-to-Arc data transfer remains paused and has not been applied.

---

# Paused Task: Sync Latest Zen Data to Chrome

## Goal
Use Firefox/Zen as the newest source. Merge missing log entries and the current week into the requested Chrome copy without losing Chrome-only entries.

## Phases

- [ ] Identify the active Media Log source and Chrome destination.
- [ ] Export fresh backups and compare week and entry counts.
- [ ] Merge with Zen winning conflicts, preserving Chrome-only records.
- [ ] Import through the extension and verify the stored result.
- [ ] Report exact coverage and backup locations.

## Safety

- Read and transfer only Media Log data. Do not read normal browser history or credentials.
- Use fresh extension exports as the source of truth.
- Back up each destination before writing. Keep personal backups out of Git.
- Do not restart browsers or touch running database files.

## Status

Paused by the title-rollback request. The user confirmed Arc's Chrome Nightly copy as the destination. Zen's transfer page is open; no import or storage write has been made. Resume with fresh exports before any merge.

---

# Completed Work: Zen Sidebar Layout

## Goal
Stop Media Log's pinned button from expanding Zen's sidebar. Keep the extension popup, other add-ons, and permissions unchanged.

## Phases

- [x] Inspect the screenshot, extension scope, installed Zen styles, and upstream reports.
- [x] Get approval for a narrow Zen profile style. The user approved it, but not a browser restart.
- [x] Reproduce the bad toolbar state and test a scoped style.
- [x] Install the style while preserving existing profile settings.
- [x] Document activation, verification limits, and removal steps.

## Findings

- Zen 1.22b uses a permission-label container that is hidden only when a button has its toolbar class.
- During toolbar moves, a pinned button can retain its menu styling. The permission label then wraps and expands the toolbar.
- Zen issue 11826 describes the same bug. Media Log's popup styles cannot affect the browser toolbar.
- The active profile already has a PiP mod, which will remain unchanged. It has no userChrome.css file.

## Status

Installed the tested Media Log-only style in the active Zen profile. All 25 fixture checks passed; existing settings and the PiP mod are preserved. The user must restart Zen to activate it. No browser restart was performed, so the live sidebar result is not yet verified. See docs/zen-sidebar-fix.md.

---

# Completed Task: Better Media Detection and Titles

## Current Goal
Improve media type and title capture in Chrome Nightly, Chrome Stable, Firefox/Zen, and iOS. Keep the content name and any season or episode details. Explain changes with examples as work progresses.

## Current Phases
- [x] Inspect the four clients and identify weak rules.
- [x] Add examples that fail under the old rules, including anikoto.cz.
- [x] Build shared detection and title rules and connect all clients.
- [x] Test examples, client behavior, browser packages, and iOS builds.
- [x] Write a short change report with expected outputs and limits.

## Current Decisions
- Use one shared JavaScript rule engine for all clients; iOS can run the bundled engine with JavaScriptCore.
- Use page identity and structured metadata before loose title keywords.
- Keep saved entries and user edits intact. Only improve suggestions for new captures.
- Treat anikoto.cz content pages as anime based on the user's example.
- Keep AnimePahe's original page title and simple anime detection, as requested.
- Do not show a suggested-type reminder beneath the form.
- Do not include em dashes in title suggestions. Join season and episode details with commas; change source em dashes to plain hyphens.

## Current Status
Complete locally. All four clients use the shared rules. AnimePahe keeps its simple capture behavior, and the suggested-type reminder is removed. Reload the browser extensions or rebuild the iOS app to try the changes. No GitHub push or store release was made for this change.

## Current Test Notes
- The old rules passed 2 of the first 15 expected outputs. Shared rules now pass 36 cases.
- A broader test caught real titles that contain Online or Watch; content names now skip playback cleanup.
- The sandbox blocked simulator services during the first iOS build. The build passed with access to those services.
- Native JavaScriptCore tests passed the shared fixtures and HTML/offline paths.
- The full repo check passed, including Firefox lint, browser package checks, and iOS Debug and Release builds.
- A live Anikoto page returned Anime with the right title and episode. The actual Nightly popup showed no reminder, using test storage. The final format uses a comma before Episode 1.
- Setup steps, examples, and limits are in docs/media-detection-notes.md. Privacy notes now explain the iOS page request.

---

# Completed Task: Resolve Missing Zen Weeks

## Goal
Recover Chrome Nightly Weeks 22 through 32, resolve the source conflict, and prepare a verified complete Zen import.

## Phases
- [x] Phase 1: Reproduce the missing week range
- [x] Phase 2: Find the authoritative Chrome Nightly storage source
- [x] Phase 3: Create and test a corrected full backup and import flow
- [x] Phase 4: Verify Zen import coverage and deliver the fix

## Key Questions
1. Does the transfer tab stay alive through Zen's file picker?
2. Does the importer read back the exact week and entry counts after writing?
3. Does Zen end with Weeks 12 through 31 plus the live Week 32 entries?

## Decisions Made
- Do not overwrite the first backup until the authoritative source is proven.
- Compare week numbers and counts only during diagnosis. Do not print titles, URLs, or notes.
- Preserve unrelated browser and extension data.

## Errors Encountered
- The first Zen import still showed data only through Week 21 even though the backup contained the later weeks.
- The first Zen database check targeted the wrong local-storage directory. The WebExtension IndexedDB store is the user-context directory reserved by Firefox for extension storage.
- Zen's real stored coverage is archived Weeks 12 through 21 plus an empty Week 32. The verified backup contains archived Weeks 12 through 31 plus 41 Week 32 entries. The popup file-picker flow did not complete the import.

## Status
**Complete** - Zen reported 945 verified entries: archived Weeks 12 through 31 and 41 current Week 32 entries. The live IndexedDB records grew after the verified import.
