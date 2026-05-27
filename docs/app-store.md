# App Store Prep

This guide is for the iOS app in `iphone-app/`.

It is not a final App Store submission yet. It is the checklist to get there.

## Current App Settings

- App name: `Media Log`
- Bundle ID: `com.hydeh3r3.MediaLog`
- Version: `1.0.0`
- Build: `1`
- Devices: iPhone and iPad
- Sync credentials: Keychain
- Local data: app document storage
- Production sync: Supabase PostgreSQL
- Paid sync price: `$2`

Run the release check:

```sh
bun run check:ios-release
```

That check verifies app metadata, app icons, local networking, Keychain storage, and this guide.

## Paid Sync And App Review

The current personal-use build opens Stripe Checkout for the `$2` sync unlock.

That is fine for local testing and personal installs. App Store submission needs a payment route decision before review.

Apple's App Store Review Guideline 3.1.1 covers payments for digital features. The guideline says apps that unlock app features or functionality may need Apple's in-app purchase system unless an allowed exception applies.

Guidelines: https://developer.apple.com/app-store/review/guidelines/

Choose one route before App Review:

- Use StoreKit for the iOS `$2` unlock.
- Use an allowed external purchase link route only if the app and storefront qualify.
- Keep Stripe Checkout outside the iOS app and remove purchase buttons or calls to action from the iOS build.

The Chrome extension can keep using Stripe Checkout. The iOS App Store build should follow the route chosen above.

## App Store Listing Draft

Subtitle:

```text
Track media across Chrome and iOS
```

Short description:

```text
Media Log helps you save what you read, watch, play, and listen to each week. Add entries on iPhone, review your history, and sync with the Chrome extension after unlocking cross-device sync.
```

Keywords:

```text
media,journal,reading,watchlist,anime,manga,books,games,music,podcast
```

Support URL:

```text
https://github.com/hydeh3r3/media-log
```

## App Privacy

Use these answers as the starting point in App Store Connect.

Data linked to the user:

- User content: media titles, URLs, ratings, notes, and history when sync is enabled.
- Contact info: email address for Supabase sign-in.
- Identifiers: Supabase Auth user ID.
- Purchase info: sync entitlement status and payment reference IDs.

Data not collected by the iOS app:

- Location
- Contacts
- Photos
- Health data
- Advertising ID

Payment handling:

- Stripe handles card data for the current personal build.
- Media Log does not store card numbers.
- PostgreSQL stores only the sync entitlement and payment reference IDs.

## TestFlight Checklist

Before TestFlight:

1. Set the Apple developer team in Xcode.
2. Pick the final iOS paid-sync route.
3. Deploy the Supabase project.
4. Set Supabase Auth redirect URLs.
5. Set Stripe or StoreKit payment secrets on the server side only.
6. Run `bun run verify`.
7. Archive from Xcode.
8. Upload the archive to App Store Connect.
9. Add a reviewer note with a demo account and sync unlock test steps.

## Screenshot List

Capture these screens:

- This Week
- Add Entry
- Edit Entry
- History
- Sync settings
- Paid sync unlock state

Use real-looking test data only. Do not use private log history in screenshots.
