# Media Log Firefox and Zen Extension

This folder is the Firefox and Zen version of the Media Log extension.

It has the same popup, storage, active tab prefill, weekly history, JSON export, and publish bridge flow as the Chrome extension.

It uses Firefox WebExtension APIs, so load this folder in Firefox or Zen, not Chrome.

The extension stores entries in the browser. When you click `Publish to Website`, it sends the saved URLs, titles, and notes to your local bridge server only.

## Load in Zen

1. Open Zen.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on`.
4. Select `/Users/wetbrain/Documents/workspace/media-log/firefox-extension/manifest.json`.
5. Open the Media Log toolbar button.

Temporary add-ons stay loaded until Zen restarts. After a restart, repeat the same load step.

## Publish to the Website

Before using `Publish to Website`, run the bridge from the website repo:

`cd /Users/wetbrain/Documents/workspace/alituncgenc.com`

`bun run publish:bridge`

The extension sends the week to `http://127.0.0.1:43187/publish`, then falls back to `http://localhost:43187/publish`.
