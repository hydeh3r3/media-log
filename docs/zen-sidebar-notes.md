# Zen Sidebar Investigation

## Evidence

- The screenshot shows a narrow, wrapped permission label beside Media Log's toolbar icon.
- The Firefox extension has no content styles or scripts that can alter Zen's browser toolbar. Its CSS is loaded only by its own popup.
- The installed Zen version is 1.22b, based on Firefox 155.0.1.
- Zen's `unified-extensions.css` hides `.unified-extensions-item-contents` only when the action button has the `toolbarbutton-1` class. The same file gives the visible permission label `word-break: break-word`.
- Zen's `zen-toolbar.css` separately hides that label inside `#zen-overflow-extensions-list` in single-toolbar mode.
- Media Log's pinned widget ID is `media-log_wetbrain_local-browser-action`.

## Cause

The screenshot matches the stale menu-style state reported in [Zen issue 11826](https://github.com/zen-browser/desktop/issues/11826). Moving or resizing toolbars can leave an extension's full menu label visible in an icon slot. [Issue 4459](https://github.com/zen-browser/desktop/issues/4459) describes the same failure after sidebar width changes.

The fix must use the button's actual toolbar location, not the stale toolbar/menu class. It must exclude real extension menus and leave all other add-ons alone.

## Safety

The user approved a small Zen profile style. They did not approve restarting Zen. No extension permissions, saved entries, history, or existing PiP styles will change.

## Tool Notes

The macOS unzip tool reports warnings for Zen's optimized omni.ja archive but reads the named CSS and markup files. The old Playwright wrapper is known to call a removed command; the current CLI package is used for layout checks.

The current CLI blocks file URLs by default. The test fixture is served over a loopback-only HTTP server instead. Only the fixture and fix stylesheet are exposed.

## Verification

- Before the fix, the fixture fails on a stale menu class in the navigation toolbar: label visible, 32 px icon, and a 290 px button height.
- After the fix, all 25 layout checks pass. The button is 36 px tall with a 16 px icon.
- Full menu controls and another add-on are unchanged.
- The source stylesheet was copied into the confirmed active profile. Its lock file was open in the running Zen process.
- Browser parity and all 36 media-detection cases still pass.
- Live sidebar verification remains pending until the user restarts Zen.
