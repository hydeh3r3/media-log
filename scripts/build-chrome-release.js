import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_DIR = join(ROOT, "chrome-extension");
const DIST_DIR = join(ROOT, "dist");
const STAGE_DIR = join(DIST_DIR, "chrome-release");
const MANIFEST_PATH = join(SOURCE_DIR, "manifest.json");

async function copyFileToStage(relativePath) {
  const sourcePath = join(SOURCE_DIR, relativePath);
  const targetPath = join(STAGE_DIR, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await Bun.write(targetPath, Bun.file(sourcePath));
}

async function run(command, args, cwd = ROOT) {
  const child = Bun.spawn([command, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${exitCode}`);
  }
}

function assertReleaseManifest(manifest) {
  const permissions = manifest.permissions ?? [];
  const blockedPermissions = ["clipboardWrite", "tabs"];
  const usedBlockedPermissions = permissions.filter((permission) =>
    blockedPermissions.includes(permission),
  );

  if (usedBlockedPermissions.length > 0) {
    throw new Error(`Release manifest keeps broad or unused permissions: ${usedBlockedPermissions.join(", ")}`);
  }

  const hostPermissions = manifest.host_permissions ?? [];
  if (hostPermissions.length > 0) {
    throw new Error("Release manifest must not include required host_permissions.");
  }

  const serialized = JSON.stringify(manifest);
  if (serialized.includes("43187") || serialized.includes("publish:bridge")) {
    throw new Error("Release manifest still references the local website bridge.");
  }
}

const manifest = await Bun.file(MANIFEST_PATH).json();
assertReleaseManifest(manifest);

await rm(STAGE_DIR, { recursive: true, force: true });
await mkdir(STAGE_DIR, { recursive: true });

const releaseFiles = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

for (const relativePath of releaseFiles) {
  if (!existsSync(join(SOURCE_DIR, relativePath))) {
    throw new Error(`Missing release file: ${relativePath}`);
  }
  await copyFileToStage(relativePath);
}

const zipName = `media-log-chrome-${manifest.version}.zip`;
const zipPath = join(DIST_DIR, zipName);
await rm(zipPath, { force: true });
await run("zip", ["-qr", zipPath, "."], STAGE_DIR);

console.log(`Created ${zipPath}`);
console.log(`Packaged files from ${basename(STAGE_DIR)}/`);
