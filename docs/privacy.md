# Privacy

Media Log Nightly stores titles, URLs, dates, ratings, notes, weekly history, drafts, your name, and your theme in the browser profile.

It reads the active tab's title and URL to fill the form. It may read headings and structured media details on that page to suggest a media type. These rules run on your device. Page content is not sent to an AI service.

Media Log does not read your full browser history. It does not use analytics or sell user data. It does not use user data for ads.

## Exports and Publishing

Export All Data downloads a JSON backup to your computer. Import Backup reads a file you choose and replaces Media Log data in that browser profile.

Publish to Website sends the chosen week's entries to your local website bridge on port 43187. The bridge may then publish them through your website project. This happens when you choose to publish.

## Keep Data Safe

Keep personal exports, browser storage, and local data files outside Git. The existing `.local-sync/` folder stays ignored.

Use Reload to update the same extension install. Keep its manifest key and folder path. Removing the extension can remove its stored data.

See [Install and Test](install-test.md) for the full backup steps.
