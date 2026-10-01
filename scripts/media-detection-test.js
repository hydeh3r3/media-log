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

const html = `<!doctype html><html><head>
  <title>Wrong document title | News</title>
  <meta content='article' property='og:type'>
  <meta property="og:site_name" content="News">
  <meta content="Research &amp; ideas | News" property="og:title">
  <!-- <meta property="og:title" content="Comment must not win"> -->
  <script>const fake = '<meta property="og:title" content="Script must not win">';</script>
  <script type="application/ld+json">{broken json}</script>
  <script type="application/ld+json">{"@type":"NewsArticle","headline":"Research & ideas"}</script>
  </head><body><article><h1>Research &amp; ideas</h1></article></body></html>`;
const signals = engine.signalsFromHTML(html, "https://news.example/articles/research");
assert.equal(signals.meta["og:title"], "Research & ideas | News");
assert.equal(signals.jsonLd.length, 1);
assert.deepEqual(detect({ url: signals.url, signals }), { title: "Wrong document title | News", type: "article", reason: "Article page metadata" });
assert.equal(engine.signalsFromHTML('<meta property="og:title" content="A &gt; B &#x1F680;">').meta["og:title"], "A > B 🚀");
console.log("Static HTML extraction handles entities, malformed JSON, and inert scripts/comments.");

// iOS parses fetched pages up to 2 MB, so hostile markup must not make the work grow faster than the page.
const hostilePages = {
  "a long attribute run": `<meta ${"a".repeat(200_000)}>`,
  "unclosed comments": "<!--".repeat(50_000),
  "unclosed meta tags": "<meta".repeat(40_000),
  "unclosed title tags": "<title".repeat(40_000),
  "an h1 full of '<'": `<h1>${"<".repeat(200_000)}</h1>`,
};
for (const [name, page] of Object.entries(hostilePages)) {
  const started = performance.now();
  engine.signalsFromHTML(page, "https://example.com/");
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 500, `Reading a page with ${name} took ${Math.round(elapsed)} ms.`);
}
assert.equal(engine.signalsFromHTML(`<div title="<meta property='og:title' content='Attribute must not win'>"></div>`).meta["og:title"], undefined);
assert.equal(engine.signalsFromHTML('<!-- unclosed <meta property="og:title" content="Comment must not win">').meta["og:title"], undefined);
assert.equal(engine.signalsFromHTML("<meta property=og:title content=It's>").meta["og:title"], "It's");
console.log("Static HTML extraction stays fast on hostile pages and reads tags the way a browser does.");
