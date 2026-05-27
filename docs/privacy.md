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

Production sync signs in through Supabase Auth. The clients can also request sign-up and password reset emails. They store a Supabase session, not the account password.

The iOS app stores the session in Keychain. The local media log JSON file should not contain sync credentials.

The Chrome extension stores the session in extension storage. The Supabase service key belongs only in Supabase function secrets.

Paid sync uses a PostgreSQL entitlement row. The repo stores sync status and payment provider references, not card data.
