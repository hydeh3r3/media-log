# Nightly Notes

Nightly is the only supported app in this repo.

- Keep the manifest key and folder path fixed.
- Keep current-week, history, draft, name, and theme storage intact.
- Keep the website publish bridge feature.
- Make title cleanup specific to the requested site.
- Keep manga chapter numbers and anime season and episode text.
- Let manual title and type edits win over a pending lookup.
- Keep Music out of the Add and Edit menus.
- Use full backup import and export to move data between browser profiles.

Project cleanup does not copy logs into another browser. Verify each import from the destination's own export before calling a transfer complete.

Use `bun run verify` before committing changes. Keep personal data and recovery copies outside Git.
