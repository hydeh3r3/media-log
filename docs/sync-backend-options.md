# Sync Backend Choice

## Options

### Supabase

Supabase is a good fit for this project.

Pros:

- Works from Chrome and iOS.
- Uses normal HTTPS APIs.
- Has auth and database rules.
- The public anon key can live in client apps when row rules are correct.
- Can later support more devices without a redesign.

Cons:

- Needs a Supabase project.
- Needs row-level security rules before real personal data is stored.

### CloudKit

CloudKit is strong on iOS.

Pros:

- Great fit for Apple devices.
- Private database sync is built for personal data.

Cons:

- Chrome support is harder.
- Web auth and CloudKit JS add more setup.
- It ties the product to Apple accounts.

### Firebase

Firebase can work well across Chrome and iOS.

Pros:

- Good client SDKs.
- Realtime sync is mature.

Cons:

- Bigger SDK footprint.
- Security rules still need care.
- It is more platform than this app needs right now.

### Custom Cloudflare Worker

A custom Worker is small and flexible.

Pros:

- Very light.
- Easy to deploy later.
- Can hide server secrets.

Cons:

- Auth, storage, backups, and conflict rules must be built by us.

## Choice

Use a small HTTPS JSON sync API first, with Supabase as the production host.

This keeps the Chrome extension and iOS app simple. It also lets us run a local Bun sync server while credentials are missing.

The API path is:

- `GET /v1/media-log?userId=...`
- `PUT /v1/media-log`

Clients send a bearer token. The local dev server uses a simple token. The Supabase version signs in with email/password, refreshes the session before sync, and uses row-level security.

The deployable Supabase files live in:

- `supabase/migrations/20260526173000_create_media_log_records.sql`
- `supabase/functions/media-log-sync/index.ts`

Setup steps are in `docs/supabase-sync.md`.

## Conflict Rule

Use stable entry IDs and `updatedAt` timestamps.

For the first version, sync sends a full snapshot. The clients merge entries by ID before upload.

Rules:

- Newer `updatedAt` wins for the same entry ID.
- Deleted entries are kept as tombstones.
- A tombstone wins when its delete time is newer than the entry edit time.
- Drafts use newest `updatedAt`.

This is enough for personal offline use across Chrome and iOS. The Supabase function also merges incoming data with the stored row before it writes.
