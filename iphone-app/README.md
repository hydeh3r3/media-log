# Media Log iOS App

This folder contains the SwiftUI companion app source and Xcode project.

It can:

- show this week's entries
- add, edit, and delete entries
- show archived weeks
- edit and delete archived entries
- save data on device
- sync with the same JSON endpoint as the Chrome extension

The app stores media log data in its local JSON file. Sync credentials are stored in Keychain.

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

- Mode: `Local dev`
- Endpoint: `http://127.0.0.1:43189`
- User ID: `personal`
- Token: `dev-media-log-token`

The local sync file is ignored.

## Production Sync

Deploy the Supabase backend from the repo root:

`bun run supabase:deploy`

Setup steps are in `docs/supabase-sync.md`.

Use these settings in the app:

- Mode: `Supabase`
- Supabase URL: `https://<project-ref>.supabase.co`
- Publishable key: your Supabase publishable key
- Email: your Supabase account email
- Password: your Supabase account password

Tap `Sign Up` if you need a new account. If Supabase asks you to confirm your email, confirm it and then tap `Sign In`.

After sign-in, tap `Sync Now`.

Use `Reset Password` to send a Supabase password reset email. Supabase must have an Auth redirect URL set before the reset link can finish the password change.

Do not paste a service key into the app. The password is used only for sign-in and is not saved.
