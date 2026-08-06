# Media Log for Zen and Firefox

This folder is the Zen and Firefox copy of Chrome Nightly Media Log.

It has the same:

- Add, This Week, History, and Settings screens
- website publish buttons
- active tab title and URL fill
- history search
- themes
- full backup export and import

The only code difference is the browser API name. Chrome uses `chrome.*`. Zen and Firefox use `browser.*`.

## Load in Zen

1. Open Zen.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Pick `/Users/wetbrain/Documents/workspace/media-log/firefox-extension/manifest.json`.
5. Open the Media Log toolbar button.

Temporary add-ons unload when Zen restarts. Repeat these steps after a restart. Your Media Log data stays in the Zen profile.

## Import Chrome Nightly Data

1. Open Media Log in Zen.
2. Click the gear button.
3. Under **Data Transfer**, click **Import Backup**.
4. In the full transfer tab, click **Import Backup** again.
5. Pick a `media-log-full-backup-YYYY-MM-DD.json` file.
6. Wait for the green **Verified** result, then check History.

The full tab stays open during Zen's file picker. Media Log reads the saved data back before it reports success.

Import replaces Media Log data in Zen. It does not change browser history, cookies, passwords, or other extensions.

## Publish to the Website

The publish buttons use the old local website bridge on port `43187`.

Run the bridge in the website repo before you publish:

```sh
bun run publish:bridge
```

## Check the Extension

Run:

```sh
bun run check:firefox
bun run check:firefox-parity
bun run lint:firefox
```
