# Media Types and Original Title Capture

## Current Behavior

Broad title cleanup has been reverted at the user's request. Only the site rules below change titles.

- Chrome Nightly, Chrome Stable, and Firefox/Zen copy the browser tab title, with three small exceptions.
- On IMDb links, the trailing `- IMDb` label is removed. The movie name and year stay intact.
- On AnimePahe `.com` and `.pw` links, the trailing `:: animepahe` label is removed.
- On `mangafreak.<TLD>` links and their subdomains, the leading `Read ` and trailing `- MangaFreak` labels are removed. The manga name and chapter stay intact.
- Page headings and structured names do not replace that title.
- Other site names, playback text, punctuation, and existing episode text are left alone.
- No season or episode text is added from the URL or page metadata.
- The title fills in immediately, without waiting for type detection.
- iOS titles are entered by hand, as before. URL lookup suggests only a media type.
- Saved entries and history are unchanged.

This rollback also removes the recent punctuation conversion. If a page title contains an em dash, the original title keeps it.

## Type Rules Kept

- All YouTube URLs default to Podcast, even when metadata says Music or Film.
- This includes Shorts, live streams, playlists, channels, YouTube Music, mobile links, short links, and privacy embeds.
- Anikoto content pages default to Anime.
- AnimePahe keeps its simple Anime selection.
- Main page metadata helps distinguish articles, films, TV, and other media. Nested recommendations are ignored.
- A generic watch URL or the word episode alone does not mean Anime.
- You can change the selected type. A pending lookup does not undo a manual change.
- No suggested-type reminder appears beneath the form.

## Examples

| Browser tab title | Captured title | Type |
| --- | --- | --- |
| Watch Show Name S02E03 Online \| Anikoto | Watch Show Name S02E03 Online \| Anikoto | Anime |
| Naruto: Shippuden - 24 :: animepahe | Naruto: Shippuden - 24 | Anime |
| Primal Fear (1996) - IMDb | Primal Fear (1996) | Film |
| Read One Piece Chapter 1195 - MangaFreak | One Piece Chapter 1195 | Manga |
| A Conversation - YouTube | A Conversation - YouTube | Podcast |

Only those labels are removed on their own sites. Titles you type or save as drafts are left alone. On iOS, the title remains whatever you enter.

## Try the Changes

- Chrome Nightly and Chrome Stable: open `chrome://extensions`, then click Reload on the matching unpacked extension.
- Firefox or Zen: open `about:debugging#/runtime/this-firefox`, then click Reload for Media Log. If it is not loaded, choose Load Temporary Add-on and select `firefox-extension/manifest.json`.
- iOS: build and run `iphone-app/MediaLog.xcodeproj` again. Paste a URL for a type suggestion; use Find type to retry.

The full setup steps are in [Install and Test](install-test.md). These are local changes, not a new store release or an update installed on an iPhone.

## Limits and Data Safety

The browser reads the open page for type clues. iOS reads public HTML without saved cookies or page scripts. Login walls and script-loaded pages can prevent type detection. Unknown types keep the current selection.

No AI service receives page content. The rules run on the device.

## Change and Test the Rules

Edit `shared/media-metadata.js`, then run:

```sh
bun run sync:media-metadata
bun run check:media-metadata
bun run verify
```

The sync command copies the same engine into all three extensions. iOS bundles the shared file directly. The check fails if a browser copy differs.

The shared cases check type detection, site-specific labels, and unchanged titles on other sites. Browser form tests also cover immediate title capture, manual edits, saved drafts, restricted pages, and YouTube defaults. The native smoke test checks JavaScriptCore and confirms the iOS lookup cannot change the title field.
