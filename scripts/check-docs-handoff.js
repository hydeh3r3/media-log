import { readFile } from "node:fs/promises";

const REQUIRED_FILES = [
  "README.md",
  "handoff.md",
  "docs/install-test.md",
  "docs/paid-sync.md",
  "docs/supabase-sync.md",
  "docs/chrome-web-store.md",
  "docs/chrome-web-store-privacy.md",
  "docs/privacy.md",
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
  ["Chrome store asset command", "bun run build:chrome-store-assets"],
  ["Chrome store asset folder", "store-assets/chrome"],
  ["Chrome screenshot size", "1280x800"],
  ["Chrome promo size", "440x280"],
  ["Chrome Web Store manual upload", "Chrome Web Store"],
  ["Chrome privacy form", "docs/chrome-web-store-privacy.md"],
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
  ["Chrome store docs mention store asset command", "docs/chrome-web-store.md", "bun run build:chrome-store-assets"],
  ["Chrome store docs mention small promo image", "docs/chrome-web-store.md", "small promotional image"],
  ["Chrome store docs mention screenshot size", "docs/chrome-web-store.md", "1280x800"],
  ["Chrome store docs link image guide", "docs/chrome-web-store.md", "https://developer.chrome.com/docs/webstore/images/"],
  ["Chrome store docs link privacy answers", "docs/chrome-web-store.md", "chrome-web-store-privacy.md"],
  ["privacy answers include single purpose", "docs/chrome-web-store-privacy.md", "Single Purpose"],
  ["privacy answers justify storage", "docs/chrome-web-store-privacy.md", "`storage`"],
  ["privacy answers justify activeTab", "docs/chrome-web-store-privacy.md", "`activeTab`"],
  ["privacy answers cover optional host access", "docs/chrome-web-store-privacy.md", "Optional Host Access"],
  ["privacy answers reject remote code", "docs/chrome-web-store-privacy.md", "No, I am not using remote code."],
  ["privacy answers disclose user content", "docs/chrome-web-store-privacy.md", "User-Provided Content"],
  ["privacy answers disclose browsing activity", "docs/chrome-web-store-privacy.md", "Web Browsing Activity"],
  ["privacy answers disclose auth info", "docs/chrome-web-store-privacy.md", "Authentication Information"],
  ["privacy answers disclose payment handling", "docs/chrome-web-store-privacy.md", "Financial And Payment Information"],
  ["privacy answers disclose no data sale", "docs/chrome-web-store-privacy.md", "does not sell user data"],
  ["privacy answers disclose paid sync purchase", "docs/chrome-web-store-privacy.md", "in-app purchases"],
  ["privacy policy mentions no ads", "docs/privacy.md", "does not use user data for ads"],
  ["privacy policy mentions Supabase", "docs/privacy.md", "Supabase"],
  ["privacy policy mentions Stripe", "docs/privacy.md", "Stripe"],
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
