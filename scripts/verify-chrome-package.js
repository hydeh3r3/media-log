import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST_DIR = join(ROOT, "dist");
const manifest = await Bun.file(join(ROOT, "chrome-stable", "manifest.json")).json();
const zipPath = join(DIST_DIR, `media-log-chrome-${manifest.version}.zip`);
const expectedEntries = [
  "icons/icon128.png",
  "icons/icon16.png",
  "icons/icon48.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js",
];
const textEntries = ["manifest.json", "popup.css", "popup.html", "popup.js"];
const blockedPackagePatterns = [
  ".DS_Store",
  "__MACOSX/",
  ".env",
  ".local-sync",
  "chrome-storage-export",
  "firefox-storage-import",
  "media-log-storage",
  "node_modules/",
  "supabase/",
  "scripts/",
];
const blockedTextPatterns = [
  "43187",
  "publish:bridge",
  "Publish to Website",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "sb_secret_",
  "sk_live_",
  "sk_test_",
  "whsec_",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runUnzip(args) {
  const result = Bun.spawnSync(["unzip", ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    fail(new TextDecoder().decode(result.stderr) || `unzip ${args.join(" ")} failed.`);
  }

  return new TextDecoder().decode(result.stdout);
}

function assertManifestIsReleaseReady(packagedManifest) {
  if (packagedManifest.manifest_version !== 3) {
    fail("Packaged manifest must use Manifest V3.");
  }

  const permissions = packagedManifest.permissions || [];
  for (const permission of permissions) {
    if (!["storage", "activeTab"].includes(permission)) {
      fail(`Packaged manifest has unexpected required permission: ${permission}`);
    }
  }

  if (packagedManifest.host_permissions?.length) {
    fail("Packaged manifest must not include required host_permissions.");
  }

  const optionalHosts = packagedManifest.optional_host_permissions || [];
  for (const host of optionalHosts) {
    if (!["https://*.supabase.co/*", "http://127.0.0.1/*", "http://localhost/*"].includes(host)) {
      fail(`Packaged manifest has unexpected optional host permission: ${host}`);
    }
  }
}

if (!existsSync(zipPath)) {
  fail(`Missing Chrome package: ${zipPath}`);
}

const packageEntries = runUnzip(["-Z1", zipPath])
  .split(/\r?\n/)
  .filter((entry) => entry && !entry.endsWith("/"))
  .sort();
const expected = [...expectedEntries].sort();

if (packageEntries.join("\n") !== expected.join("\n")) {
  fail(`Chrome package entries do not match release allowlist:\n${packageEntries.join("\n")}`);
}

for (const entry of packageEntries) {
  for (const pattern of blockedPackagePatterns) {
    if (entry.includes(pattern)) {
      fail(`Chrome package contains blocked path: ${entry}`);
    }
  }
}

for (const entry of textEntries) {
  const text = runUnzip(["-p", zipPath, entry]);
  for (const pattern of blockedTextPatterns) {
    if (text.includes(pattern)) {
      fail(`Packaged ${entry} contains blocked text: ${pattern}`);
    }
  }
}

assertManifestIsReleaseReady(JSON.parse(runUnzip(["-p", zipPath, "manifest.json"])));

console.log(`Chrome package verified: ${zipPath}`);
