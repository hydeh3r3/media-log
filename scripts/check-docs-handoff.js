import { readFile } from "node:fs/promises";

const REQUIRED_FILES = [
  "README.md",
  "handoff.md",
  "docs/install-test.md",
  "docs/paid-sync.md",
  "docs/supabase-sync.md",
  "docs/chrome-web-store.md",
  "chrome-extension/README.md",
  "firefox-extension/README.md",
  "iphone-app/README.md",
];

const INSTALL_GUIDE_REQUIREMENTS = [
  ["full verification command", "bun run verify"],
  ["Chrome dev install URL", "chrome://extensions"],
  ["Chrome extension folder", "/Users/wetbrain/Documents/workspace/media-log/chrome-extension"],
  ["Chrome package command", "bun run package:chrome"],
  ["Chrome package output", "dist/"],
  ["Chrome Web Store manual upload", "Chrome Web Store"],
  ["Chrome privacy form", "privacy form"],
  ["Zen temporary add-on page", "about:debugging#/runtime/this-firefox"],
  ["Firefox manifest path", "/Users/wetbrain/Documents/workspace/media-log/firefox-extension/manifest.json"],
  ["temporary add-on restart note", "Temporary add-ons unload"],
  ["Firefox lint command", "bun run lint:firefox"],
  ["iOS simulator build command", "bun run check:ios"],
  ["Apple team manual step", "Apple developer team"],
  ["local sync command", "bun run sync:dev"],
  ["local sync endpoint", "http://127.0.0.1:43189"],
  ["local sync token", "dev-media-log-token"],
  ["local sync smoke test", "bun run check:sync"],
  ["Supabase deploy command", "bun run supabase:deploy"],
  ["Supabase Auth redirect setup", "Supabase Auth redirect URLs"],
  ["PostgreSQL storage", "PostgreSQL"],
  ["sync data table", "media_log_records"],
  ["paid entitlement table", "media_log_sync_entitlements"],
  ["sync Edge Function", "media-log-sync"],
  ["checkout Edge Function", "media-log-checkout"],
  ["webhook Edge Function", "media-log-stripe-webhook"],
  ["Stripe secret key", "STRIPE_SECRET_KEY"],
  ["Stripe webhook secret", "STRIPE_WEBHOOK_SECRET"],
  ["paid sync price", "$2"],
  ["Stripe Checkout", "Stripe Checkout"],
  ["payment required response", "402 Payment Required"],
  ["migration button", "Prepare Local Data"],
  ["migration privacy wording", "counts only"],
  ["migration smoke test", "bun run check:migration"],
  ["Stripe smoke test", "bun run check:stripe"],
];

const CROSS_DOC_REQUIREMENTS = [
  ["README links install guide", "README.md", "docs/install-test.md"],
  ["handoff links install guide", "handoff.md", "docs/install-test.md"],
  ["paid sync docs name PostgreSQL", "docs/paid-sync.md", "PostgreSQL"],
  ["paid sync docs lock price", "docs/paid-sync.md", "$2"],
  ["paid sync docs name entitlement table", "docs/paid-sync.md", "media_log_sync_entitlements"],
  ["Supabase docs mention paid gate", "docs/supabase-sync.md", "$2"],
  ["Supabase docs mention Stripe secrets", "docs/supabase-sync.md", "STRIPE_WEBHOOK_SECRET"],
  ["Chrome store docs mention PostgreSQL entitlement", "docs/chrome-web-store.md", "PostgreSQL"],
  ["Firefox docs mention Zen reload path", "firefox-extension/README.md", "about:debugging#/runtime/this-firefox"],
  ["iOS docs mention paid sync unlock", "iphone-app/README.md", "Unlock Sync ($2)"],
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function includesCaseInsensitive(text, needle) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

const files = new Map();

for (const path of REQUIRED_FILES) {
  files.set(path, await read(path));
}

const installGuide = files.get("docs/install-test.md");

for (const [label, needle] of INSTALL_GUIDE_REQUIREMENTS) {
  assert(includesCaseInsensitive(installGuide, needle), `Install guide is missing ${label}: ${needle}`);
}

for (const [label, path, needle] of CROSS_DOC_REQUIREMENTS) {
  assert(includesCaseInsensitive(files.get(path), needle), `${label} is missing: ${needle}`);
}

console.log("Install and handoff docs check passed.");
