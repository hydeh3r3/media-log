# Nightly Notes

Nightly is the only supported app in this repo.

- Keep the manifest key and folder path fixed.
- Keep current-week, history, draft, name, and theme storage intact.
- Keep the website publish bridge feature.
- Make title cleanup specific to the requested site.
- Keep manga chapter numbers and anime season and episode text.
- Let manual title and type edits win over a pending lookup.
- A draft resumes only on its own page. On a different web page, that page fills the form and the draft is set aside with Restore and Discard.
- Keep Music out of the Add and Edit menus.
- Use full backup import and export to move data between browser profiles.
- Keep notes as plain text. The notebook's Markdown renders in the popup only; storage and the website bridge get the text unchanged.
- Keep `core.js` free of DOM and `chrome.*` calls so the checks can load it directly.

Project cleanup does not copy logs into another browser. Verify each import from the destination's own export before calling a transfer complete.

Use `bun run verify` before committing changes. Keep personal data and recovery copies outside Git.
