# Media Log iOS App

This folder contains the SwiftUI companion app source and Xcode project.

It can:

- show this week's entries
- add, edit, and delete entries
- show archived weeks
- save data on device
- sync with the same JSON endpoint as the Chrome extension

The app stores media log data in its local JSON file. The sync bearer token is stored in Keychain.

## Build Check

Run:

`xcodebuild -project iphone-app/MediaLog.xcodeproj -scheme MediaLog -destination "generic/platform=iOS Simulator" build`

This checks the SwiftUI app target from the Xcode project.

## Open In Xcode

Open:

`iphone-app/MediaLog.xcodeproj`

To install on a real iPhone, set your Apple developer team on the `MediaLog` target, then build and run from Xcode.

## Dev Sync

Run the local sync server from the repo root:

`bun run sync:dev`

Then use these settings in the app:

- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

The local sync file is ignored.

## Production Sync

Deploy the Supabase backend from the repo root:

`bun run supabase:deploy`

Setup steps are in `docs/supabase-sync.md`.

Use this endpoint in the app:

`https://<project-ref>.supabase.co/functions/v1/media-log-sync`

Use a Supabase user access token. Do not paste a service key into the app.
