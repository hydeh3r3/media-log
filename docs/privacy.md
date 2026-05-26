# Privacy Notes

Media Log stores personal media entries.

Entries may include:

- titles
- URLs
- dates
- ratings
- notes

By default, data is stored in the browser only.

When sync is enabled, the extension sends the saved media log to the sync endpoint the user entered. The same endpoint is used by the iOS app.

The app should not collect analytics, ads, or tracking data.

Secrets and local exports must not be committed. Keep `.env`, local sync files, database files, and browser storage exports ignored.
