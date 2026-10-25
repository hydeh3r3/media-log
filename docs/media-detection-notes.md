# Media Types and Original Title Capture

## Current Behavior

Broad title cleanup has been reverted at the user's request. Only the site rules below change titles.

- Nightly copies the browser tab title, with six small exceptions.
- On IMDb links, the trailing `- IMDb` label is removed. The movie name and year stay intact.
- On AnimePahe `.com` and `.pw` links, the trailing `:: animepahe` label is removed.
- On `mangafreak.<TLD>` links and their subdomains, the leading `Read ` and trailing `- MangaFreak` labels are removed. The manga name and chapter stay intact.
- On `anikototv.to` links and its subdomains, the leading `Watch ` and trailing `Anime English SUB/DUB - Anikoto` labels are removed. The name and any season or episode text stay intact.
- On YouTube links, the trailing `- YouTube` label is removed. This also applies to short links, mobile pages, YouTube Music, and privacy embeds.
- On MANGA Plus links, the trailing `| MANGA Plus` or `- MANGA Plus` label is removed. The chapter number and manga name stay intact.
- Page headings and structured names do not replace that title.
- Other site names, playback text, punctuation, and existing episode text are left alone.
- No season or episode text is added from the URL or page metadata.
- The title fills in immediately, without waiting for type detection.
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
| Watch Tokyo Revengers: War of the Three Titan Arc Episode 2 Anime English SUB/DUB - Anikoto | Tokyo Revengers: War of the Three Titan Arc Episode 2 | Anime |
| Naruto: Shippuden - 24 :: animepahe | Naruto: Shippuden - 24 | Anime |
| Primal Fear (1996) - IMDb | Primal Fear (1996) | Film |
| Read One Piece Chapter 1195 - MangaFreak | One Piece Chapter 1195 | Manga |
| [#054] Someone Hertz \| MANGA Plus | [#054] Someone Hertz | Manga |
| David Foster Wallace unedited interview (2003) - YouTube | David Foster Wallace unedited interview (2003) | Podcast |

Only those labels are removed on their own sites. Titles you type or save as drafts are left alone.

## Try the Changes

- Open `chrome://extensions` in your browser, then click Reload for Media Log Nightly.

The full setup steps are in [Install and Test](install-test.md).

## Limits and Data Safety

The browser reads the open page for type clues. Restricted pages and login walls can prevent type detection. Unknown types keep the current selection. Music is not a selectable type.

No AI service receives page content. The rules run on the device.

## Change and Test the Rules

Edit `shared/media-metadata.js`, then run:

```sh
bun run sync:media-metadata
bun run check:media-metadata
bun run verify
```

The copy command updates Nightly's bundled metadata file from the shared source. The check fails if that copy differs.

The shared cases check type detection, site-specific labels, and unchanged titles on other sites. Nightly form tests also cover immediate title capture, manual edits, saved drafts, restricted pages, and YouTube defaults.
