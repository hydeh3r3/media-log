# Zen Sidebar Fix

## What It Fixes

Zen can leave full extension-menu labels inside a pinned toolbar button after a resize or a layout change. The text can wrap into a tall column and stretch the sidebar. The screenshot matches [Zen issue 11826](https://github.com/zen-browser/desktop/issues/11826).

The style in `browser-fixes/zen-media-log-toolbar.css` keeps only Media Log's pinned button compact. It uses the real toolbar location, so it does not depend on the stale menu class.

The popup, other extensions, full extension menus, tooltip, and permission indicator are unchanged. No permissions or media history are changed.

## Installed on This Mac

The fix is installed in the active Zen profile:

```text
/Users/wetbrain/Library/Application Support/zen/Profiles/527yvcol.Default (release)
```

Changes:

- Added `chrome/media-log-toolbar.css`.
- Added `chrome/userChrome.css` to import that style.
- Added one preference to `user.js` to load custom browser styles on startup.
- Kept every existing preference and the PiP mod unchanged.

The original `user.js` is backed up in `media-log-toolbar-backup.PACHP0/user.js` inside that profile. No backup or profile data is stored in this repository.

## Activate and Check

Quit Zen fully, then reopen it when convenient. Reloading the Media Log extension alone does not load a browser style.

If Media Log was loaded as a temporary add-on, it may disappear on restart. Open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select this repo's `firefox-extension/manifest.json` again.

After reopening:

1. Check that Media Log shows as a small toolbar icon.
2. Resize the sidebar or switch its layout, then check again.
3. Open Media Log and confirm the popup still works.
4. Check the extensions menu; its full controls should still be there.

Zen was left running. The fix is installed but its result in the live sidebar still needs a check after restart.

## Tests

Run:

```sh
bun run check:zen-sidebar
```

This uses an isolated browser and a local test page, not your Zen profile. The fixture models Zen's toolbar and menu states. Without the fix the test button grows to 290 px tall. With it the button stays at 36 px.

All 25 checks pass. They cover five toolbar locations, stale and normal classes, overflow states, three menu containers, another add-on, and a non-browser document. These are layout tests, not a claim that Zen has been restarted and checked live.

## Undo

1. Remove the `@import url("media-log-toolbar.css");` line from `chrome/userChrome.css`.
2. Restart Zen.

That disables this fix without changing anything else. The added preference can stay enabled. To restore its prior state, remove the marked Media Log line from `user.js` and reset `toolkit.legacyUserProfileCustomizations.stylesheets` in `about:config`. Do not restore the whole backup if you have made other changes to `user.js` since this fix.
