// Apply the saved theme synchronously before first paint to avoid a flash.
// localStorage mirrors chrome.storage (the source of truth) and is updated
// on every theme change in initTheme().
try {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
} catch {}

const ENTRY_TYPES = {
  manga: "Manga",
  anime: "Anime",
  film: "Film",
  tv: "TV Show",
  music: "Music",
  game: "Game",
  book: "Book",
  article: "Article",
  podcast: "Podcast",
  youtube: "YouTube Video",
};
const SELECTABLE_ENTRY_TYPES = new Set(["anime", "article", "book", "film", "game", "manga", "music", "podcast", "tv"]);
const DEFAULT_ENTRY_TYPE = "article";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const BRIDGE_URLS = ["http://127.0.0.1:43187", "http://localhost:43187"];

// --- ISO week utilities ---

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function getWeekBounds(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateRange(start, end) {
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}-${end.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`;
  }
  return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} - ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
}

function getWeekInfoForDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const { week, year } = getISOWeek(date);
  const { start, end } = getWeekBounds(year, week);
  return {
    weekNumber: week,
    year,
    weekStart: formatDate(start),
    weekEnd: formatDate(end),
  };
}

function formatDayHeader(dateStr) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return `${WEEKDAYS[date.getUTCDay()]} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
}

const THEMES = new Set(["monet", "catppuccin", "tokyo-night", "dracula", "nier"]);
const DEFAULT_THEME = "monet";

function applyTheme(theme) {
  document.documentElement.dataset.theme = THEMES.has(theme) ? theme : DEFAULT_THEME;
}

async function initTheme() {
  const { theme } = await chrome.storage.local.get(["theme"]);
  const value = THEMES.has(theme) ? theme : DEFAULT_THEME;
  applyTheme(value);
  try {
    localStorage.setItem("theme", value);
  } catch {}

  const select = document.getElementById("theme-select");
  if (!select) return;
  select.value = value;
  select.addEventListener("change", async () => {
    applyTheme(select.value);
    try {
      localStorage.setItem("theme", select.value);
    } catch {}
    await chrome.storage.local.set({ theme: select.value });
  });
}

function renderGreeting(name) {
  const el = document.getElementById("greeting");
  if (!el) return;
  const trimmed = (name || "").trim();
  el.textContent = trimmed
    ? `Hey, ${trimmed} time to log what you enjoyed this week!`
    : "Hey, time to log what you enjoyed this week!";
}

async function initUserName() {
  const { userName } = await chrome.storage.local.get(["userName"]);
  renderGreeting(userName);

  const input = document.getElementById("user-name");
  if (!input) return;
  input.value = userName || "";
  input.addEventListener("input", async () => {
    renderGreeting(input.value);
    await chrome.storage.local.set({ userName: input.value });
  });
}

function switchTab(tabName) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  }
  for (const content of document.querySelectorAll(".tab-content")) {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  }
  const settingsBtn = document.getElementById("btn-settings");
  if (settingsBtn) settingsBtn.classList.toggle("active", tabName === "settings");
}

function normalizeCreatedAt(data) {
  let changed = false;
  let legacyIndex = 0;
  const legacyBaseTime = Date.UTC(2000, 0, 1);

  const normalizeEntries = (entries = []) => {
    for (const entry of entries) {
      if (!entry.createdAt) {
        entry.createdAt = new Date(legacyBaseTime + legacyIndex).toISOString();
        changed = true;
      }
      legacyIndex += 1;
    }
  };

  normalizeEntries(data.currentWeek?.entries);
  for (const week of data.history || []) {
    normalizeEntries(week.entries);
  }

  return changed;
}

// --- Storage helpers ---

async function getStorage() {
  return chrome.storage.local.get(["currentWeek", "history", "addDraft"]);
}

async function setStorage(data) {
  return chrome.storage.local.set(data);
}

function getPublishElements(scope) {
  return {
    status: document.getElementById(`${scope}-publish-status`),
  };
}

function showPublishStatus(scope, message, isError = false) {
  const { status } = getPublishElements(scope);
  status.textContent = message;
  status.style.color = isError ? "var(--danger)" : "var(--accent)";
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function showXOutput(scope, title) {
  showPublishStatus(scope, `Prepared X version for "${title}"`);
}

function hideXOutput(scope) {
  const { status } = getPublishElements(scope);
  status.textContent = "";
}

function hideAllXOutputs() {
  hideXOutput("week");
  hideXOutput("history");
}

function getAddDraft() {
  return {
    url: document.getElementById("entry-url").value,
    title: document.getElementById("entry-title").value,
    type: document.getElementById("entry-type").value,
    date: document.getElementById("entry-date").value,
    rating: document.getElementById("entry-rating").value,
    note: document.getElementById("entry-note").value,
  };
}

function normalizeSelectableType(type) {
  return SELECTABLE_ENTRY_TYPES.has(type) ? type : DEFAULT_ENTRY_TYPE;
}

function addTypeScore(scores, type, points) {
  scores[type] = (scores[type] || 0) + points;
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

// Runs inside the inspected page (serialized via chrome.scripting). Keep it
// self-contained: it may only reference page globals, never popup.js scope.
function collectPageSignals() {
  const result = {
    ogType: "",
    twitterCard: "",
    siteName: "",
    ldTypes: [],
    metaPrefixes: [],
    bodyTextLength: 0,
  };

  const getMeta = (selector) => {
    const el = document.querySelector(selector);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };

  result.ogType = getMeta('meta[property="og:type"]').toLowerCase();
  result.twitterCard = getMeta('meta[name="twitter:card"]').toLowerCase();
  result.siteName = getMeta('meta[property="og:site_name"]').toLowerCase();

  // Prefixed OG meta groups (article:, book:, music:, video:) signal a category.
  const prefixes = new Set();
  for (const meta of document.querySelectorAll("meta[property]")) {
    const prop = (meta.getAttribute("property") || "").toLowerCase();
    const colon = prop.indexOf(":");
    if (colon > 0) prefixes.add(prop.slice(0, colon));
  }
  result.metaPrefixes = [...prefixes];

  // JSON-LD structured data: collect every schema.org @type on the page.
  const types = new Set();
  const pushType = (value) => {
    if (Array.isArray(value)) {
      for (const v of value) pushType(v);
    } else if (typeof value === "string") {
      types.add(value.toLowerCase());
    }
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node["@type"]) pushType(node["@type"]);
    if (node["@graph"]) walk(node["@graph"]);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(script.textContent));
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  result.ldTypes = [...types];

  // Long-form reading content hints toward an article.
  const article = document.querySelector("article");
  const text = article ? article.textContent : document.body?.innerText;
  result.bodyTextLength = (text || "").trim().length;

  return result;
}

// Extracts structured signals from the active tab. Requires the activeTab
// grant (the popup opening counts as the user gesture). Returns null on
// restricted pages (chrome://, web store, PDFs) so callers fall back to URL.
async function extractPageSignals(tabId) {
  if (typeof tabId !== "number" || !chrome.scripting?.executeScript) {
    return null;
  }
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectPageSignals,
    });
    return injection?.result || null;
  } catch {
    return null;
  }
}

// Folds page metadata into the type scores. Structured declarations outrank
// URL/title heuristics, so they carry higher weights.
function scorePageSignals(scores, signals) {
  if (!signals) return;

  const ldTypeMap = {
    movie: "film",
    tvseries: "tv",
    tvseason: "tv",
    tvepisode: "tv",
    book: "book",
    audiobook: "book",
    musicrecording: "music",
    musicalbum: "music",
    musicgroup: "music",
    musicplaylist: "music",
    videogame: "game",
    podcastepisode: "podcast",
    podcastseries: "podcast",
    article: "article",
    newsarticle: "article",
    blogposting: "article",
    scholarlyarticle: "article",
    report: "article",
    comicseries: "manga",
    comicstory: "manga",
  };
  for (const ldType of signals.ldTypes || []) {
    const mapped = ldTypeMap[ldType];
    if (mapped) addTypeScore(scores, mapped, 14);
  }

  const ogTypeMap = {
    "video.movie": "film",
    "video.tv_show": "tv",
    "video.episode": "tv",
    "music.song": "music",
    "music.album": "music",
    "music.playlist": "music",
    book: "book",
    "books.book": "book",
    article: "article",
  };
  const mappedOg = ogTypeMap[signals.ogType];
  if (mappedOg) addTypeScore(scores, mappedOg, 12);

  for (const prefix of signals.metaPrefixes || []) {
    if (prefix === "article") addTypeScore(scores, "article", 6);
    else if (prefix === "book") addTypeScore(scores, "book", 5);
    else if (prefix === "music") addTypeScore(scores, "music", 5);
  }

  // Substantial body text nudges toward article when nothing else dominates.
  if ((signals.bodyTextLength || 0) > 2500) {
    addTypeScore(scores, "article", 3);
  }
}

function inferTypeFromTab(tab, pageSignals = null) {
  const rawUrl = tab.url || "";
  const rawTitle = tab.title || "";

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.toLowerCase();
  const query = parsedUrl.search.toLowerCase();
  const title = rawTitle.toLowerCase();
  const combined = `${host} ${path} ${query} ${title}`;
  const scores = {};

  if (host.includes("substack.com")) {
    addTypeScore(scores, "article", 10);
  }

  if (
    host.includes("mangadex") ||
    host.includes("mangaplus") ||
    host.includes("mangafire") ||
    host.includes("mangafreak.me") ||
    host.includes("manga4life") ||
    host.includes("manganato") ||
    host.includes("comick.") ||
    host.includes("comick.dev") ||
    host.includes("webtoons.")
  ) {
    addTypeScore(scores, "manga", 10);
  }

  if (host.includes("myanimelist.net")) {
    if (path.startsWith("/manga/")) addTypeScore(scores, "manga", 10);
    if (path.startsWith("/anime/")) addTypeScore(scores, "anime", 10);
  }

  if (host.includes("anilist.co")) {
    if (path.startsWith("/manga/")) addTypeScore(scores, "manga", 10);
    if (path.startsWith("/anime/")) addTypeScore(scores, "anime", 10);
  }

  if (
    /(^|[\s/:-])(chapter|ch\.?)\s*\d+/i.test(rawTitle) ||
    path.includes("/chapter-") ||
    path.includes("/chapter/") ||
    /\b(manga|manhwa|manhua|webtoon)\b/.test(combined)
  ) {
    addTypeScore(scores, "manga", 4);
  }

  if (
    host.includes("crunchyroll.com") ||
    host.includes("animepahe.com") ||
    host.includes("animepahe.pw") ||
    host.includes("anikoto.com") ||
    host.includes("anikototv.to") ||
    host.includes("hidive.com") ||
    host.includes("funimation.com")
  ) {
    addTypeScore(scores, "anime", 10);
  }

  if (path.includes("/watch/") || /\bs\d{1,2}e\d{1,3}\b/.test(title) || /\bepisode\b/.test(title)) {
    addTypeScore(scores, "anime", 3);
    addTypeScore(scores, "tv", 2);
  }

  if (host.includes("letterboxd.com")) {
    addTypeScore(scores, "film", 10);
  }

  if (host.includes("imdb.com") || host.includes("themoviedb.org") || host.includes("trakt.tv")) {
    if (/\bseason\b|\bseries\b|\bepisode\b|\bs\d{1,2}e\d{1,3}\b/.test(title)) {
      addTypeScore(scores, "tv", 7);
    } else {
      addTypeScore(scores, "film", 7);
      addTypeScore(scores, "tv", 3);
    }
  }

  if (host.includes("open.spotify.com") || host.includes("podcasts.apple.com") || host.includes("overcast.fm")) {
    if (path.includes("/episode/") || path.includes("/show/") || /\bpodcast\b/.test(title)) {
      addTypeScore(scores, "podcast", 10);
    } else {
      addTypeScore(scores, "music", 10);
    }
  }

  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    addTypeScore(scores, "podcast", 10);
    if (/\b(official audio|official video|music video|lyrics|album|single|soundtrack|ost)\b/.test(title)) {
      addTypeScore(scores, "music", 7);
    }
  }

  if (host.includes("goodreads.com") || host.includes("thestorygraph.com") || host.includes("storygraph.com")) {
    addTypeScore(scores, "book", 10);
  }

  if (
    host.includes("steampowered.com") ||
    host.includes("store.steampowered.com") ||
    host.includes("itch.io") ||
    host.includes("backloggd.com")
  ) {
    addTypeScore(scores, "game", 10);
  }

  if (
    host.includes("substack.com") ||
    host.includes("lesswrong.com") ||
    host.includes("medium.com") ||
    host.includes("arxiv.org") ||
    host.includes("openai.com") ||
    host.includes("anthropic.com") ||
    host.includes("gwern.net") ||
    host.includes("poetryfoundation.org") ||
    host.includes("colossus.com") ||
    host.startsWith("blog.")
  ) {
    addTypeScore(scores, "article", 8);
  }

  if (
    path.includes("/article/") ||
    path.includes("/articles/") ||
    path.includes("/essay/") ||
    path.includes("/essays/") ||
    path.includes("/blog/") ||
    path.includes("/post/") ||
    path.includes("/posts/") ||
    path.startsWith("/p/")
  ) {
    addTypeScore(scores, "article", 5);
  }

  if (/\b(article|essay|newsletter|blog|column|paper)\b/.test(title)) {
    addTypeScore(scores, "article", 3);
  }

  scorePageSignals(scores, pageSignals);

  const rankedTypes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (rankedTypes.length > 0 && rankedTypes[0][1] >= 5) {
    return rankedTypes[0][0];
  }

  const looksLikeArticlePage =
    !includesAny(host, [
      "mangadex",
      "mangaplus",
      "mangafire",
      "mangafreak.me",
      "crunchyroll.com",
      "anikoto.com",
      "anikototv.to",
      "hidive.com",
      "youtube.com",
      "youtu.be",
      "open.spotify.com",
      "podcasts.apple.com",
      "goodreads.com",
      "storygraph.com",
      "steampowered.com",
      "itch.io",
    ]) &&
    path !== "/" &&
    !/\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4)$/i.test(path);

  if (looksLikeArticlePage) {
    return "article";
  }

  return null;
}

async function saveAddDraft() {
  await setStorage({ addDraft: getAddDraft() });
}

async function clearAddDraft() {
  await chrome.storage.local.remove("addDraft");
}

async function restoreAddDraft() {
  const { addDraft } = await getStorage();
  if (!addDraft) return false;

  document.getElementById("entry-url").value = addDraft.url || "";
  document.getElementById("entry-title").value = addDraft.title || "";
  document.getElementById("entry-type").value = normalizeSelectableType(addDraft.type);
  document.getElementById("entry-date").value = addDraft.date || "";
  document.getElementById("entry-rating").value = addDraft.rating || "";
  document.getElementById("entry-note").value = addDraft.note || "";
  return true;
}

async function publishWeekToWebsite(weekData) {
  const payload = {
    weekNumber: weekData.weekNumber,
    year: weekData.year,
    weekStart: weekData.weekStart,
    weekEnd: weekData.weekEnd,
    entries: weekData.entries,
  };

  let lastError = "Publish bridge is not running.";
  for (const baseUrl of BRIDGE_URLS) {
    try {
      const response = await fetch(`${baseUrl}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Publish failed with ${response.status}`);
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Publish failed.";
    }
  }

  throw new Error(`${lastError} Run "bun run publish:bridge" in the website repo first.`);
}

function sortEntries(entries) {
  const sorted = entries
    .map((entry, index) => {
      const createdAt = Date.parse(entry.createdAt || "");
      return {
        entry,
        index,
        createdAt: Number.isFinite(createdAt) ? createdAt : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index)
    .map(({ entry }) => entry);

  entries.splice(0, entries.length, ...sorted);
}

function ensureHistoryWeek(data, weekInfo) {
  data.history = data.history || [];

  const existingWeek = data.history.find(
    (week) => week.weekNumber === weekInfo.weekNumber && week.year === weekInfo.year,
  );

  if (existingWeek) {
    existingWeek.weekStart = existingWeek.weekStart || weekInfo.weekStart;
    existingWeek.weekEnd = existingWeek.weekEnd || weekInfo.weekEnd;
    return existingWeek;
  }

  const newWeek = {
    weekStart: weekInfo.weekStart,
    weekEnd: weekInfo.weekEnd,
    weekNumber: weekInfo.weekNumber,
    year: weekInfo.year,
    entries: [],
  };

  data.history.unshift(newWeek);
  return newWeek;
}

function placeEntryInWeek(data, entry) {
  const targetWeek = getWeekInfoForDate(entry.date);
  const isCurrentWeek =
    data.currentWeek?.weekNumber === targetWeek.weekNumber && data.currentWeek.year === targetWeek.year;

  const targetBucket = isCurrentWeek ? data.currentWeek : ensureHistoryWeek(data, targetWeek);

  targetBucket.entries.push(entry);
  sortEntries(targetBucket.entries);

  return {
    movedToCurrentWeek: isCurrentWeek,
    targetWeek,
  };
}

async function ensureCurrentWeek() {
  const { week, year } = getISOWeek();
  const { start, end } = getWeekBounds(year, week);
  const data = await getStorage();
  const createdAtNormalized = normalizeCreatedAt(data);

  if (data.currentWeek?.weekNumber === week && data.currentWeek.year === year) {
    if (createdAtNormalized) {
      await setStorage({ currentWeek: data.currentWeek, history: data.history || [] });
    }
    return { ...data, archivedWeek: null };
  }

  // Auto-archive stale week
  const history = data.history || [];
  let archivedWeek = null;
  if (data.currentWeek?.entries && data.currentWeek.entries.length > 0) {
    archivedWeek = data.currentWeek;
    history.unshift(data.currentWeek);
  }

  const currentWeek = {
    weekStart: formatDate(start),
    weekEnd: formatDate(end),
    weekNumber: week,
    year,
    entries: [],
  };

  await setStorage({ currentWeek, history });
  return { currentWeek, history, archivedWeek };
}

// --- Tab switching ---

for (const btn of document.querySelectorAll(".tab")) {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);

    if (btn.dataset.tab === "week") renderWeek();
    if (btn.dataset.tab === "history") renderHistory();
  });
}

document.getElementById("btn-settings").addEventListener("click", () => switchTab("settings"));

let rolloverArchivedWeek = null;

// --- Add Entry ---

async function prefillFromTab({ preserveDraftType = false } = {}) {
  const titleInput = document.getElementById("entry-title");
  const urlInput = document.getElementById("entry-url");
  const typeInput = document.getElementById("entry-type");
  const dateInput = document.getElementById("entry-date");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      if (!urlInput.value) {
        urlInput.value = tab.url || "";
      }
      if (!titleInput.value) {
        titleInput.value = tab.title || "";
      }

      if (!preserveDraftType && (!typeInput.value || typeInput.value === DEFAULT_ENTRY_TYPE)) {
        const pageSignals = await extractPageSignals(tab.id);
        const inferredType = inferTypeFromTab(tab, pageSignals);
        if (inferredType && SELECTABLE_ENTRY_TYPES.has(inferredType)) {
          typeInput.value = inferredType;
        }
      }
    }
  } catch {
    // Tab API may not be available in some contexts
  }

  if (!dateInput.value) {
    dateInput.value = formatDate(new Date());
  }
}

for (const id of ["entry-url", "entry-title", "entry-type", "entry-date", "entry-rating", "entry-note"]) {
  document.getElementById(id).addEventListener("input", saveAddDraft);
  document.getElementById(id).addEventListener("change", saveAddDraft);
}

document.getElementById("entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const url = document.getElementById("entry-url").value.trim();
  const title = document.getElementById("entry-title").value.trim();
  const type = document.getElementById("entry-type").value;
  const date = document.getElementById("entry-date").value;
  const rating = document.getElementById("entry-rating").value;
  const note = document.getElementById("entry-note").value.trim();

  if (!title || !date) return;

  const entry = {
    type,
    title,
    date,
    createdAt: new Date().toISOString(),
  };
  if (url) entry.url = url;
  if (rating) entry.rating = Number.parseInt(rating, 10);
  if (note) entry.note = note;

  const data = await ensureCurrentWeek();
  const { targetWeek } = placeEntryInWeek(data, entry);
  await setStorage({ currentWeek: data.currentWeek, history: data.history || [] });
  await clearAddDraft();

  // Reset form for the next entry
  document.getElementById("entry-url").value = "";
  document.getElementById("entry-title").value = "";
  document.getElementById("entry-type").value = DEFAULT_ENTRY_TYPE;
  document.getElementById("entry-date").value = formatDate(new Date());
  document.getElementById("entry-rating").value = "";
  document.getElementById("entry-note").value = "";
  await prefillFromTab();

  const status = document.getElementById("add-status");
  status.textContent = `Added "${title}" to Week ${targetWeek.weekNumber}`;
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});

// --- This Week ---

async function renderWeek() {
  const data = await ensureCurrentWeek();
  const cw = data.currentWeek;
  const { start, end } = getWeekBounds(cw.year, cw.weekNumber);
  const header = document.getElementById("week-header");
  header.textContent = `Week ${cw.weekNumber}, ${cw.year} (${formatDateRange(start, end)}) — ${cw.entries.length} entries`;

  const container = document.getElementById("week-entries");
  if (cw.entries.length === 0) {
    container.innerHTML = '<div class="empty">No entries yet.</div>';
    return;
  }

  // Group entries by day so each weekday gets its own separator. Original
  // indices are preserved for the edit/delete handlers below.
  const groups = new Map();
  cw.entries.forEach((e, i) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push({ e, i });
  });

  container.innerHTML = [...groups.keys()]
    .sort()
    .map((date) => {
      const header = `<div class="day-separator">${escapeHtml(formatDayHeader(date))}</div>`;
      const rows = groups
        .get(date)
        .map(({ e, i }) => {
          let meta = ENTRY_TYPES[e.type] || e.type;
          if (e.rating) meta += ` — ${e.rating}/10`;
          const noteHtml = e.note ? `<div class="entry-note">${escapeHtml(e.note)}</div>` : "";
          return `<div class="entry-item" data-index="${i}">
        <div class="entry-title">${escapeHtml(e.title)}</div>
        <div class="entry-meta">${escapeHtml(meta)}</div>
        ${noteHtml}
        <div class="entry-actions">
          <button type="button" class="btn-edit" data-index="${i}">edit</button>
          <button type="button" class="btn-delete" data-index="${i}">delete</button>
        </div>
      </div>`;
        })
        .join("");
      return `<div class="day-group">${header}<div class="day-group-body">${rows}</div></div>`;
    })
    .join("");

  // Bind edit buttons
  for (const btn of container.querySelectorAll(".btn-edit")) {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startEdit(Number.parseInt(btn.dataset.index, 10));
    });
  }

  // Bind delete buttons
  for (const btn of container.querySelectorAll(".btn-delete")) {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteEntry(Number.parseInt(btn.dataset.index, 10));
    });
  }
}

// --- Edit / Delete ---

let editIndex = -1;

function startEdit(index) {
  ensureCurrentWeek().then((data) => {
    const entry = data.currentWeek.entries[index];
    if (!entry) return;

    editIndex = index;

    document.getElementById("edit-title").value = entry.title;
    document.getElementById("edit-url").value = entry.url || "";
    document.getElementById("edit-type").value = normalizeSelectableType(entry.type);
    document.getElementById("edit-date").value = entry.date;
    document.getElementById("edit-rating").value = entry.rating || "";
    document.getElementById("edit-note").value = entry.note || "";

    // Highlight the entry being edited
    for (const element of document.querySelectorAll(".entry-item")) {
      element.classList.remove("editing");
    }
    const entryElement = document.querySelector(`.entry-item[data-index="${index}"]`);
    const editForm = document.getElementById("edit-form");

    if (entryElement) {
      entryElement.classList.add("editing");
      entryElement.after(editForm);
    }

    editForm.style.display = "block";
  });
}

function hideEditForm() {
  editIndex = -1;
  const editForm = document.getElementById("edit-form");
  const entriesContainer = document.getElementById("week-entries");

  editForm.style.display = "none";
  entriesContainer.after(editForm);
  for (const element of document.querySelectorAll(".entry-item")) {
    element.classList.remove("editing");
  }
}

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (editIndex < 0) return;

  const data = await ensureCurrentWeek();
  const entry = data.currentWeek.entries[editIndex];
  if (!entry) return;

  const updatedEntry = {
    type: document.getElementById("edit-type").value,
    title: document.getElementById("edit-title").value.trim(),
    date: document.getElementById("edit-date").value,
    createdAt: entry.createdAt,
  };
  const url = document.getElementById("edit-url").value.trim();
  if (url) {
    updatedEntry.url = url;
  }
  const rating = document.getElementById("edit-rating").value;
  if (rating) {
    updatedEntry.rating = Number.parseInt(rating, 10);
  }
  const note = document.getElementById("edit-note").value.trim();
  if (note) {
    updatedEntry.note = note;
  }

  data.currentWeek.entries.splice(editIndex, 1);
  const { movedToCurrentWeek } = placeEntryInWeek(data, updatedEntry);

  await setStorage({ currentWeek: data.currentWeek, history: data.history || [] });
  hideEditForm();

  if (movedToCurrentWeek) {
    renderWeek();
    return;
  }

  switchTab("history");
  renderHistory();
});

document.getElementById("edit-cancel").addEventListener("click", hideEditForm);

async function deleteEntry(index) {
  const data = await ensureCurrentWeek();
  const entry = data.currentWeek.entries[index];
  if (!entry) return;

  data.currentWeek.entries.splice(index, 1);
  await setStorage({ currentWeek: data.currentWeek });
  hideEditForm();
  renderWeek();
}

function downloadWeekExport(weekData) {
  const weekStart = weekData.weekStart || formatDate(getWeekBounds(weekData.year, weekData.weekNumber).start);
  const weekEnd = weekData.weekEnd || formatDate(getWeekBounds(weekData.year, weekData.weekNumber).end);
  const ww = String(weekData.weekNumber).padStart(2, "0");
  const filename = `media-log-${weekData.year}-w${ww}.json`;

  const exportData = {
    week: weekData.weekNumber,
    year: weekData.year,
    start: weekStart,
    end: weekEnd,
    entries: weekData.entries,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- End Week (Export) ---

document.getElementById("btn-end-week").addEventListener("click", async () => {
  const data = await ensureCurrentWeek();
  downloadWeekExport(data.currentWeek);
});

document.getElementById("btn-publish-week").addEventListener("click", async () => {
  const data = await ensureCurrentWeek();

  try {
    hideXOutput("week");
    showPublishStatus("week", "Publishing current week...");
    const result = await publishWeekToWebsite(data.currentWeek);
    showPublishStatus("week", `Published "${result.title}" to website files.`);
  } catch (error) {
    showPublishStatus("week", getErrorMessage(error), true);
  }
});

// --- Start New Week ---

document.getElementById("btn-new-week").addEventListener("click", async () => {
  const data = await ensureCurrentWeek();
  const history = data.history || [];

  if (data.currentWeek.entries.length > 0) {
    history.unshift(data.currentWeek);
  }

  const { week, year } = getISOWeek();
  const { start, end } = getWeekBounds(year, week);
  const currentWeek = {
    weekStart: formatDate(start),
    weekEnd: formatDate(end),
    weekNumber: week,
    year,
    entries: [],
  };

  await setStorage({ currentWeek, history });
  renderWeek();
});

// --- History ---

async function renderHistory() {
  const data = await getStorage();
  const history = data.history || [];
  const container = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  const notice = document.getElementById("history-notice");

  if (rolloverArchivedWeek) {
    notice.hidden = false;
    notice.textContent = `Week ${rolloverArchivedWeek.weekNumber}, ${rolloverArchivedWeek.year} was moved here when the new ISO week started. You can still export it below.`;
  } else {
    notice.hidden = true;
    notice.textContent = "";
  }

  if (history.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  container.innerHTML = history
    .map((w, index) => {
      const { start, end } = getWeekBounds(w.year, w.weekNumber);
      const entriesHtml = w.entries
        .map((e) => {
          let meta = ENTRY_TYPES[e.type] || e.type;
          if (e.rating) meta += ` — ${e.rating}/10`;
          return `<div class="entry-item">
            <div class="entry-title">${escapeHtml(e.title)}</div>
            <div class="entry-meta">${escapeHtml(meta)}</div>
          </div>`;
        })
        .join("");

      return `<details class="history-week">
        <summary>
          <span class="history-summary-title">Week ${w.weekNumber}, ${w.year} (${formatDateRange(start, end)}) — ${w.entries.length} entries</span>
          <span class="history-summary-actions">
            <button class="history-publish" data-index="${index}">Publish</button>
          </span>
        </summary>
        <div class="history-entries">${entriesHtml}</div>
      </details>`;
    })
    .join("");

  for (const button of container.querySelectorAll(".history-publish")) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(button.dataset.index);
      const weekData = history[index];

      if (!weekData) {
        return;
      }

      try {
        hideXOutput("history");
        showPublishStatus("history", `Publishing Week ${weekData.weekNumber}...`);
        const result = await publishWeekToWebsite(weekData);
        showPublishStatus("history", `Published "${result.title}" to website files.`);
      } catch (error) {
        showPublishStatus("history", getErrorMessage(error), true);
      }
    });
  }
}

// --- Utility ---

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Init ---

async function init() {
  await initTheme();
  await initUserName();

  const initialData = await ensureCurrentWeek();
  rolloverArchivedWeek = initialData.archivedWeek;

  if (rolloverArchivedWeek) {
    switchTab("history");
    await renderHistory();
  }

  const restoredDraft = await restoreAddDraft();
  await prefillFromTab({ preserveDraftType: restoredDraft });
}

init();
