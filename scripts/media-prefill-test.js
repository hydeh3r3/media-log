import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const shared = await readFile(new URL("shared/media-metadata.js", root), "utf8");
const engine = new Function("globalThis", `${shared}\nreturn globalThis.MediaLogMetadata;`)({});

async function setup(directory, { title = "", url = "", type = "article", delayed = false, rejected = false, tab: suppliedTab } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const listeners = new Map();
      elements.set(id, {
        value: "", style: {}, dataset: {}, classList: { toggle() {} },
        addEventListener(event, listener) { const group = listeners.get(event) || []; group.push(listener); listeners.set(event, group); },
        dispatch(event) { for (const listener of listeners.get(event) || []) listener({}); },
      });
    }
    return elements.get(id);
  };
  const document = { getElementById: element, querySelectorAll: () => [], documentElement: { dataset: {} } };
  element("entry-title").value = title;
  element("entry-url").value = url;
  element("entry-type").value = type;
  const tab = suppliedTab || { id: 7, url: "https://anikoto.cz/watch/naruto/ep-24", title: "Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto" };
  let resolveSignals;
  const pending = new Promise((resolve) => { resolveSignals = resolve; });
  const signals = { url: tab.url, headings: suppliedTab ? [] : ["Naruto: Shippuden"], meta: {} };
  const api = {
    storage: { local: { set: async () => {}, get: async () => ({}) } },
    tabs: { query: async () => [tab] },
    scripting: { executeScript: async () => {
      if (rejected) throw new Error("Restricted page");
      return delayed ? pending : [{ result: signals }];
    } },
  };
  const source = (await readFile(new URL(`${directory}/popup.js`, root), "utf8")).replace(/\ninit\(\);\s*$/, "\n");
  const factory = new Function("document", "chrome", "browser", "localStorage", "MediaLogMetadata", `${source}\nreturn prefillFromTab;`);
  const prefill = factory(document, api, api, { getItem: () => null }, engine);
  return { element, prefill, release: () => resolveSignals([{ result: signals }]) };
}

for (const directory of ["chrome-nightly", "chrome-stable", "firefox-extension"]) {
  const imdbTab = { id: 12, url: "https://www.imdb.com/title/tt0117381/", title: "Primal Fear (1996) - IMDb" };
  for (const rejected of [false, true]) {
    const movie = await setup(directory, { tab: imdbTab, rejected });
    await movie.prefill();
    assert.equal(movie.element("entry-title").value, "Primal Fear (1996)");
    assert.equal(movie.element("entry-type").value, "film");
  }
  const imdbEdited = await setup(directory, { tab: imdbTab, delayed: true });
  const imdbLoading = imdbEdited.prefill();
  await Promise.resolve();
  assert.equal(imdbEdited.element("entry-title").value, "Primal Fear (1996)", "IMDb cleanup must not wait for page metadata");
  imdbEdited.element("entry-title").value = "My movie title - IMDb";
  imdbEdited.element("entry-title").dispatch("input");
  imdbEdited.release();
  await imdbLoading;
  assert.equal(imdbEdited.element("entry-title").value, "My movie title - IMDb");
  const imdbDraft = await setup(directory, { tab: imdbTab, title: "My saved title - IMDb", url: imdbTab.url });
  await imdbDraft.prefill();
  assert.equal(imdbDraft.element("entry-title").value, "My saved title - IMDb");
  for (const domain of ["animepahe.com", "animepahe.pw"]) {
    const tab = { id: 11, url: `https://${domain}/play/example`, title: "Psyren Ep. 1 :: animepahe" };
    const anime = await setup(directory, { tab, rejected: true });
    await anime.prefill();
    assert.equal(anime.element("entry-title").value, "Psyren Ep. 1");
    assert.equal(anime.element("entry-type").value, "anime");
    const edited = await setup(directory, { tab, delayed: true });
    const loading = edited.prefill();
    await Promise.resolve();
    assert.equal(edited.element("entry-title").value, "Psyren Ep. 1");
    edited.element("entry-title").value = "My anime title";
    edited.element("entry-title").dispatch("input");
    edited.release();
    await loading;
    assert.equal(edited.element("entry-title").value, "My anime title");
  }
  const normal = await setup(directory);
  await normal.prefill();
  assert.equal(normal.element("entry-title").value, "Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto");
  assert.equal(normal.element("entry-type").value, "anime");
  const manual = await setup(directory, { delayed: true });
  const loading = manual.prefill();
  await Promise.resolve();
  assert.equal(manual.element("entry-title").value, "Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto", "Title must not wait for page metadata");
  manual.element("entry-title").value = "My own title";
  manual.element("entry-title").dispatch("input");
  manual.element("entry-type").value = "film";
  manual.element("entry-type").dispatch("change");
  manual.release();
  await loading;
  assert.equal(manual.element("entry-title").value, "My own title");
  assert.equal(manual.element("entry-type").value, "film");
  const draft = await setup(directory, { title: "Draft title", url: "https://example.com/old", type: "book" });
  await draft.prefill({ preserveDraftType: true });
  assert.equal(draft.element("entry-title").value, "Draft title");
  assert.equal(draft.element("entry-type").value, "book");
  const fallback = await setup(directory, { rejected: true });
  await fallback.prefill();
  assert.equal(fallback.element("entry-title").value, "Watch Naruto: Shippuden Anime English SUB/DUB - Anikoto");
  assert.equal(fallback.element("entry-type").value, "anime");
  const youtubeTab = { id: 8, url: "https://www.youtube.com/watch?v=example", title: "A Conversation - YouTube" };
  const youtube = await setup(directory, { tab: youtubeTab });
  await youtube.prefill();
  assert.equal(youtube.element("entry-type").value, "podcast");
  assert.equal(youtube.element("entry-title").value, "A Conversation - YouTube");
  const youtubeManual = await setup(directory, { tab: youtubeTab, delayed: true });
  const youtubeLoading = youtubeManual.prefill();
  await Promise.resolve();
  youtubeManual.element("entry-type").value = "music";
  youtubeManual.element("entry-type").dispatch("change");
  youtubeManual.release();
  await youtubeLoading;
  assert.equal(youtubeManual.element("entry-type").value, "music");
  const unchangedTitle = "  Show S02E03 — Episode title | Site  ";
  const raw = await setup(directory, { tab: { id: 9, url: "https://example.com/watch/show", title: unchangedTitle } });
  await raw.prefill();
  assert.equal(raw.element("entry-title").value, unchangedTitle);
  const internal = await setup(directory, { tab: { id: 10, url: "about:blank", title: "Internal tab title" } });
  await internal.prefill();
  assert.equal(internal.element("entry-title").value, "Internal tab title");
  console.log(`${directory}: IMDb cleanup, prefill, manual edits, saved draft, URL fallback, and YouTube default/override passed.`);
}
