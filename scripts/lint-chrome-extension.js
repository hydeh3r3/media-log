import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXTENSION_DIR = join(ROOT, "chrome-nightly");
const manifest = await Bun.file(join(EXTENSION_DIR, "manifest.json")).json();
const errors = [];

function requireFile(relativePath) {
  if (!existsSync(join(EXTENSION_DIR, relativePath))) {
    errors.push(`Missing file: ${relativePath}`);
  }
}

if (manifest.manifest_version !== 3) {
  errors.push("manifest_version must be 3.");
}

for (const field of ["name", "version", "description", "action", "icons"]) {
  if (!manifest[field]) {
    errors.push(`Missing manifest field: ${field}`);
  }
}

const permissions = manifest.permissions || [];
for (const permission of permissions) {
  if (!["storage", "tabs", "activeTab", "scripting", "clipboardWrite"].includes(permission)) {
    errors.push(`Unexpected required permission: ${permission}`);
  }
}

for (const host of manifest.host_permissions || []) {
  if (!["http://127.0.0.1:43187/*", "http://localhost:43187/*"].includes(host)) {
    errors.push(`Unexpected host permission: ${host}`);
  }
}
if (manifest.optional_host_permissions?.length) errors.push("Nightly does not use optional host permissions.");
if (!manifest.key) errors.push("Keep Nightly's manifest key so its extension ID and stored data stay linked.");

requireFile(manifest.action?.default_popup || "");
for (const iconPath of Object.values(manifest.icons || {})) {
  requireFile(iconPath);
}
for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
  requireFile(iconPath);
}

const sourceFiles = ["manifest.json", "popup.html", "popup.css", "popup.js", "media-metadata.js"];
for (const file of sourceFiles) {
  requireFile(file);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Nightly manifest and source checks passed.");
