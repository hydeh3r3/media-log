import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url);
const ROOT_PATH = ROOT.pathname;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_PATH,
    encoding: "utf8",
  });

  assert(result.status === 0, `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function readInfoPlist() {
  const output = run("plutil", ["-convert", "json", "-o", "-", "iphone-app/Info.plist"]);
  return JSON.parse(output);
}

function assertPbxprojValue(source, key, value) {
  assert(source.includes(`${key} = ${value};`), `Xcode project must set ${key} to ${value}.`);
}

function imageDimensions(relativePath) {
  const output = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", relativePath]);
  const width = output.match(/pixelWidth:\s+(\d+)/)?.[1];
  const height = output.match(/pixelHeight:\s+(\d+)/)?.[1];

  assert(width && height, `Could not read dimensions for ${relativePath}.`);
  return {
    width: Number(width),
    height: Number(height),
  };
}

function findIconEntry(contents, expected) {
  return contents.images.find(
    (image) => image.idiom === expected.idiom && image.size === expected.size && image.scale === expected.scale,
  );
}

const infoPlist = readInfoPlist();

assert(infoPlist.CFBundleDisplayName === "Media Log", "Info.plist must keep the app display name.");
assert(infoPlist.CFBundleIdentifier === "$(PRODUCT_BUNDLE_IDENTIFIER)", "Info.plist must use the Xcode bundle ID setting.");
assert(infoPlist.CFBundleShortVersionString === "$(MARKETING_VERSION)", "Info.plist must use the marketing version setting.");
assert(infoPlist.CFBundleVersion === "$(CURRENT_PROJECT_VERSION)", "Info.plist must use the build number setting.");
assert(infoPlist.NSAppTransportSecurity?.NSAllowsLocalNetworking === true, "iOS app must allow local dev sync.");
assert(
  infoPlist.NSAppTransportSecurity?.NSAllowsArbitraryLoads !== true,
  "iOS app must not allow arbitrary network loads.",
);

const pbxproj = await read("iphone-app/MediaLog.xcodeproj/project.pbxproj");

assertPbxprojValue(pbxproj, "PRODUCT_BUNDLE_IDENTIFIER", "com.hydeh3r3.MediaLog");
assertPbxprojValue(pbxproj, "MARKETING_VERSION", "1.0.0");
assertPbxprojValue(pbxproj, "CURRENT_PROJECT_VERSION", "1");
assertPbxprojValue(pbxproj, "SWIFT_VERSION", "6.0");
assertPbxprojValue(pbxproj, "TARGETED_DEVICE_FAMILY", '"1,2"');
assertPbxprojValue(pbxproj, "DEVELOPMENT_TEAM", '""');

const appIconPath = "iphone-app/Assets.xcassets/AppIcon.appiconset/Contents.json";
const appIconContents = JSON.parse(await read(appIconPath));
const expectedIcons = [
  { idiom: "iphone", size: "20x20", scale: "2x", filename: "icon-40.png", pixels: 40 },
  { idiom: "iphone", size: "20x20", scale: "3x", filename: "icon-60.png", pixels: 60 },
  { idiom: "iphone", size: "29x29", scale: "2x", filename: "icon-58.png", pixels: 58 },
  { idiom: "iphone", size: "29x29", scale: "3x", filename: "icon-87.png", pixels: 87 },
  { idiom: "iphone", size: "40x40", scale: "2x", filename: "icon-80.png", pixels: 80 },
  { idiom: "iphone", size: "40x40", scale: "3x", filename: "icon-120.png", pixels: 120 },
  { idiom: "iphone", size: "60x60", scale: "2x", filename: "icon-120.png", pixels: 120 },
  { idiom: "iphone", size: "60x60", scale: "3x", filename: "icon-180.png", pixels: 180 },
  { idiom: "ipad", size: "20x20", scale: "1x", filename: "icon-20.png", pixels: 20 },
  { idiom: "ipad", size: "20x20", scale: "2x", filename: "icon-40.png", pixels: 40 },
  { idiom: "ipad", size: "29x29", scale: "1x", filename: "icon-29.png", pixels: 29 },
  { idiom: "ipad", size: "29x29", scale: "2x", filename: "icon-58.png", pixels: 58 },
  { idiom: "ipad", size: "40x40", scale: "1x", filename: "icon-40.png", pixels: 40 },
  { idiom: "ipad", size: "40x40", scale: "2x", filename: "icon-80.png", pixels: 80 },
  { idiom: "ipad", size: "76x76", scale: "2x", filename: "icon-152.png", pixels: 152 },
  { idiom: "ipad", size: "83.5x83.5", scale: "2x", filename: "icon-167.png", pixels: 167 },
  { idiom: "ios-marketing", size: "1024x1024", scale: "1x", filename: "icon-1024.png", pixels: 1024 },
];

for (const expected of expectedIcons) {
  const entry = findIconEntry(appIconContents, expected);
  assert(entry, `App icon set is missing ${expected.idiom} ${expected.size} ${expected.scale}.`);
  assert(entry.filename === expected.filename, `App icon ${expected.idiom} ${expected.size} ${expected.scale} must use ${expected.filename}.`);

  const relativePath = join("iphone-app/Assets.xcassets/AppIcon.appiconset", entry.filename);
  assert(existsSync(join(ROOT_PATH, relativePath)), `App icon file is missing: ${relativePath}`);

  const dimensions = imageDimensions(relativePath);
  assert(
    dimensions.width === expected.pixels && dimensions.height === expected.pixels,
    `${entry.filename} must be ${expected.pixels}x${expected.pixels}.`,
  );
}

const models = await read("iphone-app/Sources/MediaLog/Models.swift");
const storedMediaLog = models.slice(models.indexOf("struct StoredMediaLog"));
assert(!storedMediaLog.includes("SyncCredential"), "StoredMediaLog must not persist sync credentials.");

const store = await read("iphone-app/Sources/MediaLog/MediaLogStore.swift");
assert(store.includes("KeychainCredentialStore()"), "MediaLogStore must default to Keychain credential storage.");
assert(!store.includes("syncCredential: syncCredential"), "MediaLogStore must not write sync credentials to local JSON.");

const keychainStore = await read("iphone-app/Sources/MediaLog/KeychainTokenStore.swift");
assert(
  keychainStore.includes("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly"),
  "Keychain token storage must stay device-only.",
);

const appStoreDocs = await read("docs/app-store.md");
for (const needle of [
  "App Store Review Guideline 3.1.1",
  "StoreKit",
  "App Privacy",
  "TestFlight",
  "Stripe Checkout",
]) {
  assert(appStoreDocs.includes(needle), `App Store docs must mention ${needle}.`);
}

console.log("iOS release checks passed.");
