import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const loadGlobal = async (path, name) => {
  const source = await readFile(new URL(path, root), "utf8");
  return new Function("globalThis", `${source}\nreturn globalThis.${name};`)({});
};
const metadata = await loadGlobal("shared/media-metadata.js", "MediaLogMetadata");
const core = await loadGlobal("chrome-nightly/core.js", "MediaLogCore");
const popupSource = (await readFile(new URL("chrome-nightly/popup.js", root), "utf8")).replace(/\ninit\(\);\s*$/, "\n");

const DEFAULT_TAB = { id: 7, url: "https://anikoto.cz/watch/naruto/ep-24", title: "Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto" };

// Load popup.js against stub DOM and chrome APIs. `delayed` holds the page lookup until release().
function setup({ title = "", url = "", type = "article", delayed = false, rejected = false, tab = DEFAULT_TAB } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const listeners = new Map();
      elements.set(id, {
        value: "", style: {}, dataset: {}, classList: { toggle() {} },
        addEventListener(event, listener) { listeners.set(event, [...(listeners.get(event) || []), listener]); },
        dispatch(event) { for (const listener of listeners.get(event) || []) listener({}); },
      });
    }
    return elements.get(id);
  };
  const document = { getElementById: element, querySelectorAll: () => [], documentElement: { dataset: {} } };
  element("entry-title").value = title;
  element("entry-url").value = url;
  element("entry-type").value = type;

  let resolveSignals;
  const pending = new Promise((resolve) => { resolveSignals = resolve; });
  const signals = { url: tab.url, headings: tab === DEFAULT_TAB ? ["Naruto: Shippuden"] : [], meta: {} };
  const api = {
    storage: { local: { set: async () => {}, get: async () => ({}) } },
    tabs: { query: async () => [tab] },
    scripting: { executeScript: async () => {
      if (rejected) throw new Error("Restricted page");
      return delayed ? pending : [{ result: signals }];
    } },
  };
  const factory = new Function(
    "document", "chrome", "localStorage", "MediaLogMetadata", "MediaLogCore",
    `${popupSource}\nreturn { prefillFromTab, bindDraftFields };`,
  );
  const popup = factory(document, api, { getItem: () => null }, metadata, core);
  popup.bindDraftFields();

  const edit = (name, value, event = "input") => {
    element(`entry-${name}`).value = value;
    element(`entry-${name}`).dispatch(event);
  };
  const field = (name) => element(`entry-${name}`).value;
  return { prefill: popup.prefillFromTab, edit, field, release: () => resolveSignals([{ result: signals }]) };
}

// Site rules: the cleaned title fills in before the page lookup, the type follows,
// a manual edit during the lookup wins, and a saved draft title is left alone.
const sites = [
  {
    name: "AnikotoTV .bz",
    tab: { id: 15, url: "https://anikototv.bz/watch/draw-this-then-die-5xdt/ep-2", title: "Watch Draw This, Then Die! Episode 2 Anime Online | Anikoto" },
    title: "Draw This, Then Die! Episode 2",
    type: "anime",
    lookups: [false, true],
    manualTitle: "My anime episode title",
    draftTitle: "My saved title | Anikoto",
  },
  {
    name: "AnikotoTV",
    tab: { id: 14, url: "https://anikototv.to/watch/tokyo-revengers/episode-2", title: "Watch Tokyo Revengers: War of the Three Titan Arc Episode 2 Anime English SUB/DUB - Anikoto" },
    title: "Tokyo Revengers: War of the Three Titan Arc Episode 2",
    type: "anime",
    lookups: [true],
    manualTitle: "My episode title",
  },
  {
    name: "MangaFreak",
    tab: { id: 13, url: "https://mangafreak.me/Read1_One_Piece_1195", title: "Read One Piece Chapter 1195 - MangaFreak" },
    title: "One Piece Chapter 1195",
    type: "manga",
    lookups: [true],
    manualTitle: "My chapter title",
  },
  {
    name: "IMDb",
    tab: { id: 12, url: "https://www.imdb.com/title/tt0117381/", title: "Primal Fear (1996) - IMDb" },
    title: "Primal Fear (1996)",
    type: "film",
    lookups: [false, true],
    manualTitle: "My movie title - IMDb",
    draftTitle: "My saved title - IMDb",
  },
  ...["animepahe.com", "animepahe.pw"].map((domain) => ({
    name: `AnimePahe ${domain}`,
    tab: { id: 11, url: `https://${domain}/play/example`, title: "Psyren Ep. 1 :: animepahe" },
    title: "Psyren Ep. 1",
    type: "anime",
    lookups: [true],
    manualTitle: "My anime title",
  })),
];

for (const site of sites) {
  // `rejected` = the page lookup fails, as on restricted pages.
  for (const rejected of site.lookups) {
    const run = setup({ tab: site.tab, rejected });
    await run.prefill();
    assert.equal(run.field("title"), site.title, `${site.name}: cleaned title`);
    assert.equal(run.field("type"), site.type, `${site.name}: type`);
  }

  const manual = setup({ tab: site.tab, delayed: true });
  const loading = manual.prefill();
  await Promise.resolve();
  assert.equal(manual.field("title"), site.title, `${site.name}: cleanup must not wait for page metadata`);
  manual.edit("title", site.manualTitle);
  manual.release();
  await loading;
  assert.equal(manual.field("title"), site.manualTitle, `${site.name}: manual title wins`);

  if (site.draftTitle) {
    const draft = setup({ tab: site.tab, title: site.draftTitle, url: site.tab.url });
    await draft.prefill();
    assert.equal(draft.field("title"), site.draftTitle, `${site.name}: saved draft title stays`);
  }
}

// Other sites keep the tab title as is.
const normal = setup();
await normal.prefill();
assert.equal(normal.field("title"), DEFAULT_TAB.title);
assert.equal(normal.field("type"), "anime");

const manual = setup({ delayed: true });
const loading = manual.prefill();
await Promise.resolve();
assert.equal(manual.field("title"), DEFAULT_TAB.title, "Title must not wait for page metadata");
manual.edit("title", "My own title");
manual.edit("type", "film", "change");
manual.release();
await loading;
assert.equal(manual.field("title"), "My own title");
assert.equal(manual.field("type"), "film");

const draft = setup({ title: "Draft title", url: "https://example.com/old", type: "book" });
await draft.prefill({ preserveDraftType: true });
assert.equal(draft.field("title"), "Draft title");
assert.equal(draft.field("type"), "book");

const fallback = setup({ rejected: true });
await fallback.prefill();
assert.equal(fallback.field("title"), DEFAULT_TAB.title);
assert.equal(fallback.field("type"), "anime");

// YouTube defaults to Podcast, and manual changes still win.
const youtubeTab = { id: 8, url: "https://www.youtube.com/watch?v=example", title: "David Foster Wallace unedited interview (2003) - YouTube" };
const youtube = setup({ tab: youtubeTab });
await youtube.prefill();
assert.equal(youtube.field("type"), "podcast");
assert.equal(youtube.field("title"), "David Foster Wallace unedited interview (2003)");

const youtubeManual = setup({ tab: youtubeTab, delayed: true });
const youtubeLoading = youtubeManual.prefill();
await Promise.resolve();
assert.equal(youtubeManual.field("title"), "David Foster Wallace unedited interview (2003)");
youtubeManual.edit("title", "My title - YouTube");
youtubeManual.edit("type", "film", "change");
youtubeManual.release();
await youtubeLoading;
assert.equal(youtubeManual.field("title"), "My title - YouTube");
assert.equal(youtubeManual.field("type"), "film");

const unchangedTitle = "  Show S02E03 — Episode title | Site  ";
const raw = setup({ tab: { id: 9, url: "https://example.com/watch/show", title: unchangedTitle } });
await raw.prefill();
assert.equal(raw.field("title"), unchangedTitle);

const internal = setup({ tab: { id: 10, url: "about:blank", title: "Internal tab title" } });
await internal.prefill();
assert.equal(internal.field("title"), "Internal tab title");
assert.equal(internal.field("url"), "", "Only web links fill the URL; others would break backup import");
const ownPage = setup({ tab: { id: 16, url: "chrome-extension://abc/popup.html?notebook=1", title: "Notes · Media Log notes" } });
await ownPage.prefill();
assert.equal(ownPage.field("url"), "");

// A saved draft resumes on its own page. On a different web page the open page fills the form,
// the draft is set aside, and nothing set aside is ever overwritten.
const imdb = "https://www.imdb.com/title/tt37510326/";
const leftover = { url: "http://localhost:5197/app/#/MOR-108?s=top", title: "Manifesto · more", note: "first idea" };
const imdbDraft = { url: imdb, title: "The Social Reckoning (2026)", note: "courtroom" };
const older = { url: "https://example.com/older", title: "Older", note: "keep me" };

assert.deepEqual(core.planDrafts(null, [], imdb), { form: null, parked: [], changed: false });
assert.deepEqual(core.planDrafts(imdbDraft, [older], imdb), { form: imdbDraft, parked: [older], changed: false }, "Same page resumes");
assert.deepEqual(core.planDrafts(leftover, [], imdb), { form: null, parked: [leftover], changed: true }, "A draft from another page must not block the open page");
assert.deepEqual(core.planDrafts(leftover, [older], imdb).parked, [leftover, older], "Set-aside entries accumulate, newest first");
assert.deepEqual(core.planDrafts(leftover, [imdbDraft, older], imdb), { form: imdbDraft, parked: [leftover, older], changed: true }, "This page's set-aside entry comes back");
assert.deepEqual(core.planDrafts(null, [older, imdbDraft], imdb), { form: imdbDraft, parked: [older], changed: true });
assert.equal(core.planDrafts({ ...leftover, url: "" }, [], imdb).form.title, "Manifesto · more", "A draft without a URL resumes");
assert.deepEqual(core.planDrafts(leftover, [older], "chrome://newtab/"), { form: leftover, parked: [older], changed: false }, "No web page: resume the draft");
assert.equal(core.planDrafts(leftover, [], undefined).form, leftover);

// Restore steps through every set-aside entry; the draft in the form goes to the back, never away.
assert.equal(core.restoreParked(imdbDraft, []), null);
assert.deepEqual(core.restoreParked(imdbDraft, [leftover, older]), { form: leftover, parked: [older, imdbDraft] });
assert.deepEqual(core.restoreParked(null, [leftover, older]), { form: leftover, parked: [older] }, "A form with no draft has nothing to keep");
{
  let form = imdbDraft;
  let parked = [leftover, older];
  const seen = [form.title];
  for (let i = 0; i < 3; i++) ({ form, parked } = core.restoreParked(form, parked)), seen.push(form.title);
  assert.deepEqual(seen, ["The Social Reckoning (2026)", "Manifesto · more", "Older", "The Social Reckoning (2026)"]);
  assert.equal(parked.length, 2, "Three entries in, three entries out");
}

// The default date is the local calendar day.
assert.match(normal.field("date"), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(normal.field("date"), core.localDateString());

console.log(`chrome-nightly: ${sites.length} site title rules, prefill, manual edits, saved draft, URL fallback, and YouTube default/override passed.`);
