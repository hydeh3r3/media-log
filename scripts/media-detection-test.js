import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fixtures = JSON.parse(await readFile(new URL("shared/media-detection-fixtures.json", root), "utf8"));
const source = await readFile(new URL("shared/media-metadata.js", root), "utf8");
const engine = new Function("globalThis", `${source}\nreturn globalThis.MediaLogMetadata;`)({});
const detect = (input) => engine.detect(input);
let failures = 0;
for (const fixture of fixtures) {
  const actual = detect(fixture.input);
  try {
    assert.equal(actual.type, fixture.expected.type);
    assert.equal(actual.title, fixture.expected.title);
  } catch {
    failures++;
    console.error(`${fixture.name}: expected ${JSON.stringify(fixture.expected)}, got ${JSON.stringify({ type: actual.type, title: actual.title })}`);
  }
}
console.log(`${fixtures.length - failures}/${fixtures.length} media detection examples passed.`);
if (failures) process.exitCode = 1;

for (const host of ["animepahe.com", "animepahe.pw", "www.animepahe.pw"]) {
  assert.equal(detect({ url: `https://${host}/play/example`, title: "Psyren Ep. 1 :: animepahe" }).title, "Psyren Ep. 1");
  assert.equal(detect({ url: `https://${host}/play/example`, signals: { title: "Psyren Ep. 1 :: AnimePahe  " } }).title, "Psyren Ep. 1");
  assert.equal(detect({ url: `https://${host}/play/example`, title: "Psyren :: animepahe discussion" }).title, "Psyren :: animepahe discussion");
}
for (const host of ["example.com", "animepahe.com.example.com", "fakeanimepahe.pw"]) {
  assert.equal(detect({ url: `https://${host}/play/example`, title: "Psyren Ep. 1 :: animepahe" }).title, "Psyren Ep. 1 :: animepahe");
}
