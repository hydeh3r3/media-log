# Task Plan: Resolve Missing Zen Weeks

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
