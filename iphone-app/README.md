# Media Log iOS App

This folder contains the SwiftUI companion app source.

It can:

- show this week's entries
- add, edit, and delete entries
- show archived weeks
- save data on device
- sync with the same JSON endpoint as the Chrome extension

## Build Check

Run:

`xcodebuild -scheme MediaLog -destination "generic/platform=iOS Simulator" build`

This checks the SwiftUI app target from the Swift Package.

## Dev Sync

Run the local sync server from the repo root:

`bun run sync:dev`

Then use these settings in the app:

- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

The local sync file is ignored.
