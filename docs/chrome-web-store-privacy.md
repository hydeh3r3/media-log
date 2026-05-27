# Chrome Web Store Privacy Answers

Use this page when filling out the Chrome Web Store privacy and distribution forms.

These answers match the current Chrome extension source and production sync plan.

## Single Purpose

Media Log helps a person save a weekly list of what they read, watch, play, and listen to. It can also sync that list with the Media Log iOS app when the person signs in and unlocks paid sync.

## Permission Justification

### `storage`

Media Log uses browser storage to save entries, drafts, history, sync settings, and sync session data on the device.

### `activeTab`

Media Log uses the active tab only when the popup is opened. It reads the current tab title and URL so the user can save the page as a media entry.

### Optional Host Access

Media Log asks for host access only when the user turns on sync.

Allowed hosts:

- `https://*.supabase.co/*`
- `http://127.0.0.1/*`
- `http://localhost/*`

Supabase host access is used for production sync, sign-in, password reset, and the paid sync checkout function.

Localhost host access is used only for local development sync.

## Remote Code Answer

Select:

```text
No, I am not using remote code.
```

Reason:

Media Log ships all executable extension code in the extension package. It does not load or run remote JavaScript. It only sends JSON requests to Supabase or to a local sync endpoint chosen by the user.

## Data Types To Disclose Or Explain

Disclose these data types if the Chrome Web Store form asks what the extension collects or transmits.

### Personally Identifiable Information

Media Log may send the user's email address to Supabase Auth when the user signs in, signs up, or requests a password reset.

### Authentication Information

Media Log sends the password to Supabase Auth during sign-in or sign-up. It does not save the password.

Media Log stores Supabase session tokens in extension storage so it can sync after sign-in.

If local dev sync is used, Media Log stores the local token entered by the user.

### Web Browsing Activity

Media Log may save the title and URL of the active tab when the user chooses to save it as an entry.

It does not read full browser history. It does not track browsing in the background.

### Website Content

Media Log may save page titles and URLs chosen by the user. It may also save notes written by the user about that page or media item.

### User-Provided Content

Media Log saves media entries written by the user.

Entries may include:

- title
- URL
- media type
- date
- rating
- note

### Financial And Payment Information

Media Log does not collect or store card numbers or card details.

Stripe handles checkout and card storage for the optional `$2` paid sync unlock.

Media Log stores only sync entitlement status and Stripe reference IDs in PostgreSQL.

## Data Use Certification

Use this wording for the limited-use or data-use certification:

```text
Media Log uses data only to provide the user's media log, browser capture, authentication, paid sync unlock, and cross-device sync features.

Media Log does not sell user data.

Media Log does not use user data for ads.

Media Log does not use user data to determine creditworthiness or lending eligibility.

Media Log does not transfer user data except as needed to provide the feature the user chose. Production sync uses Supabase. Paid checkout uses Stripe. Local dev sync sends data only to the endpoint entered by the user.
```

## Privacy Policy URL

Use a public URL for the privacy policy.

After this repo is pushed, this GitHub URL can be used:

```text
https://github.com/hydeh3r3/media-log/blob/main/docs/privacy.md
```

If a website page is created later, use that stable page instead.

## In-App Purchase Disclosure

If the Chrome Web Store form asks whether the extension has in-app purchases, answer:

```text
Yes.
```

Use this description:

```text
Media Log works locally without payment. Cross-device sync is an optional one-time $2 unlock. Stripe handles checkout and card storage. The sync unlock is stored as an entitlement row in PostgreSQL.
```

## Store Listing Disclosure

Make sure the full store description includes:

```text
Cross-device sync is a paid $2 unlock. Stripe handles checkout and card storage. Media Log stores only the sync entitlement status and Stripe references in PostgreSQL.
```

## Notes For Review

- The extension has no analytics.
- The extension has no ads.
- The extension does not sell data.
- The extension does not run remote JavaScript.
- Production sync uses HTTPS Supabase Edge Functions.
- The Chrome release zip does not include Supabase server code or Stripe secrets.
