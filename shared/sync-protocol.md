# Media Log Sync Protocol

The sync protocol is a small JSON API shared by Chrome and iOS.

## Record Shape

Each user has one media log record:

- `userId`
- `revision`
- `updatedAt`
- `data`

The `data` object contains:

- `currentWeek`
- `history`
- `addDraft`
- `tombstones`

## Entry Shape

Entries should include:

- `id`
- `type`
- `title`
- `date`
- `createdAt`
- `updatedAt`
- `url`, optional
- `rating`, optional
- `note`, optional

Older local entries may not have IDs. Clients must add IDs before sync.

## Read

Request:

`GET /v1/media-log?userId=personal`

Response:

- `ok`
- `record`

## Write

Request:

`PUT /v1/media-log`

Body fields:

- `userId`
- `clientId`
- `data`

Response:

- `ok`
- `record`

## Auth

Clients send:

`Authorization: Bearer <token>`

The local dev server uses a simple token. Production uses Supabase Auth and row-level security.

Production clients sign in with Supabase email/password auth, then use the returned access token for sync requests. Refresh tokens are used to renew the session before sync.

## Verification

Run:

```sh
bun run check:sync
```

This starts the local sync server on a temporary port, syncs one safe synthetic entry, checks a two-client offline merge, reads the data back, and deletes the temporary data file.

## Offline Merge

Clients merge before they upload:

- entries are matched by `id`
- newest `updatedAt` wins
- deleted entries are stored in `tombstones`
- a tombstone wins when its delete time is newer than the entry edit time
- drafts use newest `updatedAt`

The local dev sync server follows the same merge rule as the production Supabase function. That keeps local smoke tests useful when real backend credentials are not set.
