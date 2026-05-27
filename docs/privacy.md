# Privacy Policy

Media Log stores personal media entries.

Entries may include:

- titles
- URLs
- dates
- ratings
- notes

By default, data is stored in the browser only.

When sync is enabled, the extension sends the saved media log to the sync endpoint the user entered. The same endpoint is used by the iOS app.

## Data Media Log Handles

Media Log may handle:

- media entries written by the user
- active tab title and URL when the user saves the current page
- Supabase account email
- Supabase session tokens
- local dev sync token, if the user enters one
- Stripe payment reference IDs for paid sync

Media Log does not read full browser history.

Media Log does not track browsing in the background.

Media Log does not collect card numbers or card details.

## How Data Is Used

Media Log uses data to:

- save the user's media log
- prefill a new entry from the active tab
- keep weekly history
- sign in to Supabase
- sync with the iOS app
- unlock paid sync after payment

The app does not collect analytics, ads, or tracking data.

Media Log does not sell user data.

Media Log does not use user data for ads.

Media Log does not use user data to decide credit or lending eligibility.

Secrets and local exports must not be committed. Keep `.env`, local sync files, database files, and browser storage exports ignored.

Production sync signs in through Supabase Auth. The clients can also request sign-up and password reset emails. They store a Supabase session, not the account password.

The iOS app stores the session in Keychain. The local media log JSON file should not contain sync credentials.

The Chrome extension stores the session in extension storage. The Supabase service key belongs only in Supabase function secrets.

Paid sync uses a PostgreSQL entitlement row. Stripe handles checkout and card storage. The repo stores sync status and Stripe references, not card data.

## Data Sharing

Media Log sends data only when needed for a user-chosen feature:

- Supabase receives account and media log data for production sync.
- Stripe receives checkout data for the optional `$2` sync unlock.
- A local dev sync endpoint receives media log data only when the user enters that endpoint.

## Security

Production sync uses HTTPS.

Server secrets belong only in Supabase function secrets.

Do not paste service keys or Stripe secret keys into Chrome, Firefox, Zen, or iOS.
