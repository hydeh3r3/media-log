import { readFile } from "node:fs/promises";

const REQUIRED_FILES = [
  "supabase/config.toml",
  "supabase/migrations/20260526173000_create_media_log_records.sql",
  "supabase/functions/media-log-sync/index.ts",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

for (const path of REQUIRED_FILES) {
  await read(path);
}

const config = await read("supabase/config.toml");
assert(config.includes("verify_jwt = true"), "Supabase function must require JWT verification.");

const migration = await read("supabase/migrations/20260526173000_create_media_log_records.sql");
assert(migration.includes("enable row level security"), "Migration must enable row-level security.");
assert(migration.includes("auth.uid() = user_id"), "Migration must restrict rows to the authenticated user.");
assert(migration.includes("references auth.users"), "Rows must be owned by Supabase Auth users.");

const functionSource = await read("supabase/functions/media-log-sync/index.ts");
const transpiledFunction = new Bun.Transpiler({ loader: "ts" }).transformSync(functionSource);
new Function(transpiledFunction);

assert(functionSource.includes("/auth/v1/user"), "Function must validate the bearer token with Supabase Auth.");
assert(functionSource.includes("SUPABASE_SECRET_KEYS"), "Function must read server-only Supabase secret keys.");
assert(functionSource.includes("mergeSnapshots"), "Function must merge incoming data with stored data before writing.");
assert(!/eyJ[A-Za-z0-9_-]{20,}\./.test(functionSource), "Function must not contain hard-coded JWT values.");
assert(!/sb_secret_[A-Za-z0-9_-]+/.test(functionSource), "Function must not contain hard-coded Supabase secret keys.");

console.log("Supabase backend checks passed.");
