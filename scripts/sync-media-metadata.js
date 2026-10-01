import { readFile, writeFile } from "node:fs/promises";

// Extension packages cannot load files outside their own directory.
// Keep these generated copies exact, and bundle the original file in iOS.
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("shared/media-metadata.js", root), "utf8");
for (const directory of ["chrome-nightly", "chrome-stable", "firefox-extension"]) {
  const target = new URL(`${directory}/media-metadata.js`, root);
  if (process.argv.includes("--check")) {
    if (await readFile(target, "utf8") !== source) throw new Error(`${directory}: run bun run sync:media-metadata.`);
  } else {
    await writeFile(target, source);
  }
}
console.log(process.argv.includes("--check") ? "All extension metadata engines match the shared source." : "Updated all three extension metadata engines.");
