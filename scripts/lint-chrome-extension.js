import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXTENSION_DIR = join(ROOT, "chrome-extension");
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
  if (!["storage", "activeTab"].includes(permission)) {
    errors.push(`Unexpected required permission: ${permission}`);
  }
}

if (manifest.host_permissions?.length) {
  errors.push("Chrome release must not have required host_permissions.");
}

const optionalHosts = manifest.optional_host_permissions || [];
for (const host of optionalHosts) {
  if (!["https://*.supabase.co/*", "http://127.0.0.1/*", "http://localhost/*"].includes(host)) {
    errors.push(`Unexpected optional host permission: ${host}`);
  }
}

requireFile(manifest.action?.default_popup || "");
for (const iconPath of Object.values(manifest.icons || {})) {
  requireFile(iconPath);
}
for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
  requireFile(iconPath);
}

const sourceFiles = ["manifest.json", "popup.html", "popup.css", "popup.js"];
const bridgePatterns = ["43187", "publish:bridge", "Publish to Website"];
for (const file of sourceFiles) {
  const text = await Bun.file(join(EXTENSION_DIR, file)).text();
  for (const pattern of bridgePatterns) {
    if (text.includes(pattern)) {
      errors.push(`${file} still contains release-blocked bridge text: ${pattern}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Chrome extension manifest and release source checks passed.");
