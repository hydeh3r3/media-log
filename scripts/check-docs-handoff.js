import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const files = ["README.md", "handoff.md", "docs/install-test.md", "docs/privacy.md", "docs/media-detection-notes.md", "shared/README.md"];
for (const path of files) {
  const source = await readFile(new URL(path, root), "utf8");
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    await access(new URL(match[1].split("#")[0], new URL(path, root)));
  }
}
const guide = await readFile(new URL("docs/install-test.md", root), "utf8");
for (const required of ["chrome://extensions", "chrome-nightly", "Export All Data", "Import Backup", "bun run verify"]) assert.ok(guide.includes(required), `Install guide must explain ${required}.`);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
for (const command of Object.values(pkg.scripts)) {
  for (const match of command.matchAll(/scripts\/[\w.-]+\.js/g)) await access(new URL(match[0], root));
}
const retired = ["chrome-stable", "firefox-extension", "iphone-app", "supabase", "store-assets", "browser-fixes", "dist"];
const present = await readdir(root);
for (const name of retired) assert.ok(!present.includes(name), `Retired folder still exists: ${name}`);
console.log("Nightly install docs, links, script paths, and project layout passed.");
