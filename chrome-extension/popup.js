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
const STORAGE_KEYS = ["currentWeek", "history", "addDraft", "syncConfig", "syncSession", "syncState", "syncTombstones"];
const SYNC_MODES = {
  SUPABASE: "supabase",
  LOCAL: "local",
};
const SUPABASE_SYNC_PATH = "/functions/v1/media-log-sync";
const SUPABASE_CHECKOUT_PATH = "/functions/v1/media-log-checkout";
const TOKEN_REFRESH_MARGIN_MS = 60_000;

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

function switchTab(tabName) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  }
  for (const content of document.querySelectorAll(".tab-content")) {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  }
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
  return chrome.storage.local.get(STORAGE_KEYS);
}

async function setStorage(data) {
  return chrome.storage.local.set(data);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function getAddDraft() {
  return {
    url: document.getElementById("entry-url").value,
    title: document.getElementById("entry-title").value,
    type: document.getElementById("entry-type").value,
    date: document.getElementById("entry-date").value,
    rating: document.getElementById("entry-rating").value,
    note: document.getElementById("entry-note").value,
    updatedAt: new Date().toISOString(),
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

function inferTypeFromTab(tab) {
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

  const rankedTypes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (rankedTypes.length > 0 && rankedTypes[0][1] >= 5) {
    return rankedTypes[0][0];
  }

  const looksLikeArticlePage =
    !includesAny(host, [
      "mangadex",
      "mangaplus",
      "mangafire",
      "crunchyroll.com",
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
  await markSyncDirty("draft");
}

async function clearAddDraft() {
  await chrome.storage.local.remove("addDraft");
  await markSyncDirty("draft-cleared");
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

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function weekKey(week) {
  return `${week.year}-W${String(week.weekNumber).padStart(2, "0")}`;
}

function timestampValue(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestTimestamp(a, b) {
  return timestampValue(a) >= timestampValue(b) ? a : b;
}

function cloneSnapshot(data) {
  return JSON.parse(
    JSON.stringify({
      currentWeek: data.currentWeek || null,
      history: data.history || [],
      addDraft: data.addDraft || null,
      tombstones: data.syncTombstones || data.tombstones || {},
    }),
  );
}

function ensureEntryMetadata(entry) {
  let changed = false;
  if (!entry.id) {
    entry.id = createId();
    changed = true;
  }
  if (!entry.createdAt) {
    entry.createdAt = new Date().toISOString();
    changed = true;
  }
  if (!entry.updatedAt) {
    entry.updatedAt = entry.createdAt;
    changed = true;
  }
  return changed;
}

function normalizeSnapshot(snapshot) {
  let changed = false;
  const normalizeEntries = (entries = []) => {
    for (const entry of entries) {
      if (ensureEntryMetadata(entry)) {
        changed = true;
      }
    }
  };

  normalizeEntries(snapshot.currentWeek?.entries);
  for (const week of snapshot.history || []) {
    normalizeEntries(week.entries);
  }

  if (snapshot.addDraft && !snapshot.addDraft.updatedAt) {
    snapshot.addDraft.updatedAt = new Date().toISOString();
    changed = true;
  }

  snapshot.tombstones = snapshot.tombstones || {};
  return changed;
}

function getSnapshotFromStorage(data) {
  const snapshot = cloneSnapshot(data);
  normalizeSnapshot(snapshot);
  return snapshot;
}

function mergeDraft(localDraft, remoteDraft) {
  if (!localDraft) return remoteDraft || null;
  if (!remoteDraft) return localDraft;
  return timestampValue(localDraft.updatedAt) >= timestampValue(remoteDraft.updatedAt) ? localDraft : remoteDraft;
}

function mergeTombstones(localTombstones = {}, remoteTombstones = {}) {
  const tombstones = { ...remoteTombstones };
  for (const [entryId, deletedAt] of Object.entries(localTombstones)) {
    tombstones[entryId] = newestTimestamp(deletedAt, tombstones[entryId]);
  }
  return tombstones;
}

function addWeekToMap(map, week) {
  if (!week) return;
  const key = weekKey(week);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...week, entries: [...(week.entries || [])] });
    return;
  }

  existing.weekStart = existing.weekStart || week.weekStart;
  existing.weekEnd = existing.weekEnd || week.weekEnd;
  existing.entries.push(...(week.entries || []));
}

function mergeWeekEntries(entries, tombstones) {
  const byId = new Map();
  for (const entry of entries) {
    const existing = byId.get(entry.id);
    if (!existing || timestampValue(entry.updatedAt) >= timestampValue(existing.updatedAt)) {
      byId.set(entry.id, entry);
    }
  }

  const merged = [];
  for (const entry of byId.values()) {
    const deletedAt = tombstones[entry.id];
    if (deletedAt && timestampValue(deletedAt) >= timestampValue(entry.updatedAt)) {
      continue;
    }
    merged.push(entry);
  }

  sortEntries(merged);
  return merged;
}

function mergeSnapshots(localSnapshot, remoteSnapshot) {
  if (!remoteSnapshot) return localSnapshot;

  normalizeSnapshot(localSnapshot);
  normalizeSnapshot(remoteSnapshot);

  const tombstones = mergeTombstones(localSnapshot.tombstones, remoteSnapshot.tombstones);
  const weeks = new Map();

  addWeekToMap(weeks, remoteSnapshot.currentWeek);
  for (const week of remoteSnapshot.history || []) addWeekToMap(weeks, week);
  addWeekToMap(weeks, localSnapshot.currentWeek);
  for (const week of localSnapshot.history || []) addWeekToMap(weeks, week);

  for (const week of weeks.values()) {
    week.entries = mergeWeekEntries(week.entries || [], tombstones);
  }

  const currentKey = localSnapshot.currentWeek
    ? weekKey(localSnapshot.currentWeek)
    : remoteSnapshot.currentWeek
      ? weekKey(remoteSnapshot.currentWeek)
      : null;
  const currentWeek = currentKey ? weeks.get(currentKey) || null : null;
  const history = [...weeks.entries()]
    .filter(([key]) => key !== currentKey)
    .map(([, week]) => week)
    .sort((a, b) => b.year - a.year || b.weekNumber - a.weekNumber);

  return {
    currentWeek,
    history,
    addDraft: mergeDraft(localSnapshot.addDraft, remoteSnapshot.addDraft),
    tombstones,
  };
}

async function getClientId(syncState = null) {
  const state = syncState || (await getStorage()).syncState || {};
  if (state.clientId) return state.clientId;
  return createId();
}

async function markSyncDirty(reason) {
  const data = await getStorage();
  const now = new Date().toISOString();
  const syncState = {
    ...(data.syncState || {}),
    clientId: await getClientId(data.syncState || {}),
    dirtyAt: now,
    dirtyReason: reason,
  };
  await setStorage({ syncState });
}

async function saveSnapshot(snapshot, syncStatePatch = {}) {
  const syncState = {
    ...(await getStorage()).syncState,
    ...syncStatePatch,
  };
  await setStorage({
    currentWeek: snapshot.currentWeek,
    history: snapshot.history || [],
    addDraft: snapshot.addDraft || null,
    syncTombstones: snapshot.tombstones || {},
    syncState,
  });
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function getEntryMeta(entry, includeDate = false) {
  let meta = ENTRY_TYPES[entry.type] || entry.type;
  if (entry.rating) meta += ` — ${entry.rating}/10`;
  if (includeDate) meta += ` — ${entry.date}`;
  return meta;
}

function createEntryItem(entry) {
  const item = document.createElement("div");
  item.className = "entry-item";
  item.appendChild(createTextElement("div", "entry-title", entry.title));
  return item;
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
  const snapshot = getSnapshotFromStorage(data);
  const metadataNormalized = JSON.stringify(snapshot) !== JSON.stringify(cloneSnapshot(data));

  if (data.currentWeek?.weekNumber === week && data.currentWeek.year === year) {
    if (createdAtNormalized || metadataNormalized) {
      await saveSnapshot(snapshot, {
        ...(data.syncState || {}),
        clientId: await getClientId(data.syncState || {}),
      });
    }
    return { ...data, ...snapshot, archivedWeek: null };
  }

  // Auto-archive stale week
  const history = snapshot.history || [];
  let archivedWeek = null;
  if (snapshot.currentWeek?.entries && snapshot.currentWeek.entries.length > 0) {
    archivedWeek = snapshot.currentWeek;
    history.unshift(snapshot.currentWeek);
  }

  const currentWeek = {
    weekStart: formatDate(start),
    weekEnd: formatDate(end),
    weekNumber: week,
    year,
    entries: [],
  };

  await saveSnapshot({ ...snapshot, currentWeek, history }, {
    ...(data.syncState || {}),
    clientId: await getClientId(data.syncState || {}),
    dirtyAt: new Date().toISOString(),
    dirtyReason: "week-rollover",
  });
  return { ...snapshot, currentWeek, history, archivedWeek };
}

function normalizeEndpoint(endpoint) {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/media-log")) {
    url.pathname = `${path}/v1/media-log`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeSupabaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Supabase URL must use HTTPS.");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function supabaseFunctionEndpoint(supabaseUrl) {
  return `${normalizeSupabaseUrl(supabaseUrl)}${SUPABASE_SYNC_PATH}`;
}

function supabaseCheckoutEndpoint(supabaseUrl) {
  return `${normalizeSupabaseUrl(supabaseUrl)}${SUPABASE_CHECKOUT_PATH}`;
}

function syncResourceUrl(endpoint, userId) {
  const url = new URL(normalizeEndpoint(endpoint));
  url.searchParams.set("userId", userId || "personal");
  return url.toString();
}

async function requestSyncHostPermission(endpoint) {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) {
    return true;
  }

  const endpointUrl = new URL(endpoint);
  const originPattern = `${endpointUrl.protocol}//${endpointUrl.hostname}/*`;
  const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
  if (hasPermission) {
    return true;
  }

  return chrome.permissions.request({ origins: [originPattern] });
}

async function authRequest(config, grantType, body) {
  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error_description || result.msg || result.error || `Auth failed with ${response.status}`);
  }

  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + Math.max((result.expires_in || 3600) - 30, 1) * 1000,
    userEmail: result.user?.email || config.email || "",
  };
}

async function authActionRequest(config, path, body) {
  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error_description || result.msg || result.error || `Auth failed with ${response.status}`);
  }

  return result;
}

function sessionFromAuthResult(result, fallbackEmail) {
  const tokenResult = result.session?.access_token ? result.session : result;
  if (!tokenResult.access_token || !tokenResult.refresh_token) {
    return null;
  }

  return {
    accessToken: tokenResult.access_token,
    refreshToken: tokenResult.refresh_token,
    expiresAt: Date.now() + Math.max((tokenResult.expires_in || 3600) - 30, 1) * 1000,
    userEmail: tokenResult.user?.email || result.user?.email || fallbackEmail || "",
  };
}

async function signInWithSupabase(config, password) {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.email || !password) {
    throw new Error("Supabase URL, key, email, and password are required.");
  }

  const allowed = await requestSyncHostPermission(config.supabaseUrl);
  if (!allowed) {
    throw new Error("Supabase host permission was not granted.");
  }

  const session = await authRequest(config, "password", {
    email: config.email,
    password,
  });
  await setStorage({ syncSession: session });
  return session;
}

async function signUpWithSupabase(config, password) {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.email || !password) {
    throw new Error("Supabase URL, key, email, and password are required.");
  }

  const allowed = await requestSyncHostPermission(config.supabaseUrl);
  if (!allowed) {
    throw new Error("Supabase host permission was not granted.");
  }

  const result = await authActionRequest(config, "signup", {
    email: config.email,
    password,
  });
  const session = sessionFromAuthResult(result, config.email);
  if (session) {
    await setStorage({ syncSession: session });
  }
  return session;
}

async function requestSupabasePasswordReset(config) {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.email) {
    throw new Error("Supabase URL, key, and email are required.");
  }

  const allowed = await requestSyncHostPermission(config.supabaseUrl);
  if (!allowed) {
    throw new Error("Supabase host permission was not granted.");
  }

  await authActionRequest(config, "recover", {
    email: config.email,
  });
}

async function refreshSupabaseSession(config, session) {
  if (!session?.refreshToken) {
    throw new Error("Sign in to Supabase first.");
  }

  const refreshed = await authRequest(config, "refresh_token", {
    refresh_token: session.refreshToken,
  });
  await setStorage({ syncSession: refreshed });
  return refreshed;
}

async function signOutOfSupabase(config, session) {
  if (session?.accessToken && config.supabaseUrl && config.supabaseAnonKey) {
    const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
    await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    }).catch(() => {});
  }
  await setStorage({ syncSession: null });
}

async function getSyncAuth(config, storedSession) {
  const mode = config.mode || SYNC_MODES.SUPABASE;
  if (mode === SYNC_MODES.LOCAL) {
    if (!config.endpoint || !config.token) {
      throw new Error("Local endpoint and token are required.");
    }
    return {
      endpoint: normalizeEndpoint(config.endpoint),
      token: config.token,
      userId: config.userId || "personal",
    };
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase URL and publishable key are required.");
  }

  const session = storedSession?.accessToken && storedSession.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS
    ? storedSession
    : await refreshSupabaseSession(config, storedSession);

  return {
    endpoint: supabaseFunctionEndpoint(config.supabaseUrl),
    token: session.accessToken,
    userId: config.userId || "personal",
  };
}

async function createSyncUnlockCheckout(config, storedSession) {
  if ((config.mode || SYNC_MODES.SUPABASE) !== SYNC_MODES.SUPABASE) {
    throw new Error("Switch sync mode to Supabase first.");
  }

  const allowed = await requestSyncHostPermission(config.supabaseUrl);
  if (!allowed) {
    throw new Error("Supabase host permission was not granted.");
  }

  const auth = await getSyncAuth(config, storedSession);
  const response = await fetch(supabaseCheckoutEndpoint(config.supabaseUrl), {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const result = await response.json();

  if (!response.ok || !result.ok || !result.checkoutUrl) {
    throw new Error(result.error || `Checkout failed with ${response.status}`);
  }

  return result.checkoutUrl;
}

async function openExternalUrl(url) {
  if (chrome.tabs?.create) {
    await chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener");
}

async function fetchSyncRecord(config) {
  const response = await fetch(syncResourceUrl(config.endpoint, config.userId), {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Sync pull failed with ${response.status}`);
  }

  return result.record;
}

async function pushSyncRecord(config, clientId, snapshot) {
  const response = await fetch(normalizeEndpoint(config.endpoint), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: config.userId || "personal",
      clientId,
      data: snapshot,
    }),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Sync push failed with ${response.status}`);
  }

  return result.record;
}

function getSyncConfigFromForm() {
  const mode = document.getElementById("sync-mode").value;
  const supabaseUrl = document.getElementById("sync-supabase-url").value.trim();
  return {
    mode,
    endpoint: document.getElementById("sync-endpoint").value.trim(),
    userId: document.getElementById("sync-user-id").value.trim() || "personal",
    token: document.getElementById("sync-token").value,
    supabaseUrl,
    supabaseAnonKey: document.getElementById("sync-supabase-key").value.trim(),
    email: document.getElementById("sync-email").value.trim(),
  };
}

function showSyncStatus(message, isError = false) {
  const status = document.getElementById("sync-status");
  status.textContent = message;
  status.style.color = isError ? "#C44" : "#DA7756";
}

function renderSyncSummary(data) {
  const currentEntries = data.currentWeek?.entries?.length || 0;
  const historyWeeks = data.history?.length || 0;
  const historyEntries = (data.history || []).reduce((sum, week) => sum + (week.entries?.length || 0), 0);
  const migrationStats = getSnapshotStats(cloneSnapshot(data));
  const config = data.syncConfig || {};
  const session = data.syncSession || {};
  const modeText = (config.mode || SYNC_MODES.SUPABASE) === SYNC_MODES.LOCAL ? "Local dev" : "Supabase";
  const authText = config.mode === SYNC_MODES.LOCAL
    ? "Local token saved"
    : session.accessToken
      ? `Signed in${session.userEmail ? ` as ${session.userEmail}` : ""}`
      : "Not signed in";
  const lastSyncedAt = data.syncState?.lastSyncedAt ? new Date(data.syncState.lastSyncedAt).toLocaleString() : "Never";
  const dirtyText = data.syncState?.dirtyAt ? "Local changes waiting to sync" : "No local changes waiting";
  const migrationText = migrationStats.entriesNeedingMetadata > 0
    ? `${migrationStats.entriesNeedingMetadata} entries need local prep`
    : "Local data is ready for sync";

  document.getElementById("sync-summary").textContent =
    `Mode: ${modeText}\nAuth: ${authText}\nCurrent entries: ${currentEntries}\nArchived weeks: ${historyWeeks}\nArchived entries: ${historyEntries}\nLast sync: ${lastSyncedAt}\n${dirtyText}\n${migrationText}`;
}

function getSnapshotStats(snapshot) {
  const stats = {
    currentEntries: snapshot.currentWeek?.entries?.length || 0,
    historyWeeks: snapshot.history?.length || 0,
    historyEntries: 0,
    totalEntries: 0,
    entriesNeedingMetadata: 0,
    tombstones: Object.keys(snapshot.tombstones || {}).length,
    draftPresent: Boolean(snapshot.addDraft?.title || snapshot.addDraft?.url || snapshot.addDraft?.note),
  };

  const addEntries = (entries = []) => {
    for (const entry of entries) {
      stats.totalEntries += 1;
      if (!entry.id || !entry.createdAt || !entry.updatedAt) {
        stats.entriesNeedingMetadata += 1;
      }
    }
  };

  addEntries(snapshot.currentWeek?.entries);
  for (const week of snapshot.history || []) {
    stats.historyEntries += week.entries?.length || 0;
    addEntries(week.entries);
  }

  return stats;
}

function formatMigrationReport(report) {
  const preparedCount = report.before.entriesNeedingMetadata;
  const preparedText = preparedCount === 1
    ? "Added missing metadata to 1 entry."
    : `Added missing metadata to ${preparedCount} entries.`;
  const draftText = report.after.draftPresent ? "Draft saved." : "No draft saved.";

  return `Prepared local data. Entries: ${report.after.totalEntries}. Archived weeks: ${report.after.historyWeeks}. Tombstones: ${report.after.tombstones}. ${preparedText} ${draftText}`;
}

async function prepareLocalDataForSync() {
  const beforeData = await getStorage();
  const before = getSnapshotStats(cloneSnapshot(beforeData));
  const currentData = await ensureCurrentWeek();
  const snapshot = getSnapshotFromStorage(currentData);
  const now = new Date().toISOString();
  const syncStatePatch = {
    ...(currentData.syncState || {}),
    clientId: await getClientId(currentData.syncState || {}),
  };

  if (before.entriesNeedingMetadata > 0) {
    syncStatePatch.dirtyAt = now;
    syncStatePatch.dirtyReason = "migration";
  }

  await saveSnapshot(snapshot, syncStatePatch);

  const afterData = await getStorage();
  return {
    before,
    after: getSnapshotStats(cloneSnapshot(afterData)),
  };
}

async function restoreSyncSettings() {
  const data = await getStorage();
  const config = data.syncConfig || {};
  const mode = config.mode || SYNC_MODES.SUPABASE;
  document.getElementById("sync-mode").value = mode;
  document.getElementById("sync-endpoint").value = config.endpoint || "";
  document.getElementById("sync-user-id").value = config.userId || "personal";
  document.getElementById("sync-token").value = config.token || "";
  document.getElementById("sync-supabase-url").value = config.supabaseUrl || "";
  document.getElementById("sync-supabase-key").value = config.supabaseAnonKey || "";
  document.getElementById("sync-email").value = config.email || data.syncSession?.userEmail || "";
  document.getElementById("sync-password").value = "";
  updateSyncModeFields(mode);
  renderSyncSummary(data);
}

function updateSyncModeFields(mode) {
  const localFields = document.querySelector(".sync-local-fields");
  const supabaseFields = document.querySelector(".sync-supabase-fields");
  const isLocal = mode === SYNC_MODES.LOCAL;
  localFields.hidden = !isLocal;
  supabaseFields.hidden = isLocal;
}

function configForSave(config) {
  if (config.mode === SYNC_MODES.LOCAL) {
    return {
      mode: SYNC_MODES.LOCAL,
      endpoint: normalizeEndpoint(config.endpoint),
      userId: config.userId || "personal",
      token: config.token,
    };
  }

  return {
    mode: SYNC_MODES.SUPABASE,
    endpoint: supabaseFunctionEndpoint(config.supabaseUrl),
    userId: config.userId || "personal",
    supabaseUrl: normalizeSupabaseUrl(config.supabaseUrl),
    supabaseAnonKey: config.supabaseAnonKey,
    email: config.email,
  };
}

async function syncNow() {
  const data = await ensureCurrentWeek();
  const config = data.syncConfig || getSyncConfigFromForm();
  const auth = await getSyncAuth(config, data.syncSession || null);

  const allowed = await requestSyncHostPermission(auth.endpoint);
  if (!allowed) {
    throw new Error("Sync host permission was not granted.");
  }

  const clientId = await getClientId(data.syncState || {});
  const localSnapshot = getSnapshotFromStorage(data);
  const remoteRecord = await fetchSyncRecord(auth);
  const mergedSnapshot = mergeSnapshots(localSnapshot, remoteRecord.data);
  const savedRecord = await pushSyncRecord(auth, clientId, mergedSnapshot);
  const returnedSnapshot = savedRecord.data || mergedSnapshot;
  const now = new Date().toISOString();

  await saveSnapshot(returnedSnapshot, {
    ...(data.syncState || {}),
    clientId,
    lastRevision: savedRecord.revision,
    lastSyncedAt: now,
    dirtyAt: null,
    dirtyReason: null,
  });

  return savedRecord;
}

// --- Tab switching ---

for (const btn of document.querySelectorAll(".tab")) {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);

    if (btn.dataset.tab === "week") renderWeek();
    if (btn.dataset.tab === "history") renderHistory();
    if (btn.dataset.tab === "sync") restoreSyncSettings();
  });
}

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
        const inferredType = inferTypeFromTab(tab);
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

  const now = new Date().toISOString();
  const entry = {
    id: createId(),
    type,
    title,
    date,
    createdAt: now,
    updatedAt: now,
  };
  if (url) entry.url = url;
  if (rating) entry.rating = Number.parseInt(rating, 10);
  if (note) entry.note = note;

  const data = await ensureCurrentWeek();
  const { targetWeek } = placeEntryInWeek(data, entry);
  await setStorage({ currentWeek: data.currentWeek, history: data.history || [] });
  await markSyncDirty("entry-added");
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
    container.replaceChildren(createTextElement("div", "empty", "No entries yet."));
    return;
  }

  container.replaceChildren();
  cw.entries.forEach((entry, index) => {
    const item = createEntryItem(entry);
    item.dataset.index = String(index);
    item.appendChild(createTextElement("div", "entry-meta", getEntryMeta(entry, true)));

    if (entry.note) {
      item.appendChild(createTextElement("div", "entry-note", entry.note));
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn-edit";
    editButton.dataset.index = String(index);
    editButton.textContent = "edit";
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startEdit(index);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-delete";
    deleteButton.dataset.index = String(index);
    deleteButton.textContent = "delete";
    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteEntry(index);
    });

    actions.append(editButton, deleteButton);
    item.appendChild(actions);
    container.appendChild(item);
  });
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
    id: entry.id || createId(),
    type: document.getElementById("edit-type").value,
    title: document.getElementById("edit-title").value.trim(),
    date: document.getElementById("edit-date").value,
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  await markSyncDirty("entry-edited");
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
  const syncTombstones = {
    ...(data.syncTombstones || {}),
    [entry.id || createId()]: new Date().toISOString(),
  };
  await setStorage({ currentWeek: data.currentWeek, syncTombstones });
  await markSyncDirty("entry-deleted");
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

// --- Export and Week Control ---

document.getElementById("btn-export-week").addEventListener("click", async () => {
  const data = await ensureCurrentWeek();
  downloadWeekExport(data.currentWeek);
});

async function startFreshWeek() {
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
  await markSyncDirty("week-started");
  renderWeek();
}

document.getElementById("btn-end-week").addEventListener("click", startFreshWeek);

// --- Start New Week ---

document.getElementById("btn-new-week").addEventListener("click", async () => {
  await startFreshWeek();
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
    container.replaceChildren();
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  container.replaceChildren();
  history.forEach((weekData, index) => {
    const { start, end } = getWeekBounds(weekData.year, weekData.weekNumber);
    const details = document.createElement("details");
    details.className = "history-week";

    const summary = document.createElement("summary");
    const title = createTextElement(
      "span",
      "history-summary-title",
      `Week ${weekData.weekNumber}, ${weekData.year} (${formatDateRange(start, end)}) — ${weekData.entries.length} entries`,
    );

    const actions = document.createElement("span");
    actions.className = "history-summary-actions";

    const exportButton = document.createElement("button");
    exportButton.className = "history-export";
    exportButton.dataset.index = String(index);
    exportButton.textContent = "Export";
    exportButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadWeekExport(weekData);
    });

    actions.appendChild(exportButton);
    summary.append(title, actions);

    const entries = document.createElement("div");
    entries.className = "history-entries";
    for (const entry of weekData.entries) {
      const item = createEntryItem(entry);
      item.appendChild(createTextElement("div", "entry-meta", getEntryMeta(entry)));
      entries.appendChild(item);
    }

    details.append(summary, entries);
    container.appendChild(details);
  });
}

// --- Sync ---

document.getElementById("sync-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const config = configForSave(getSyncConfigFromForm());
    const permissionTarget = config.mode === SYNC_MODES.LOCAL ? config.endpoint : config.supabaseUrl;
    const allowed = await requestSyncHostPermission(permissionTarget);
    if (!allowed) {
      throw new Error("Sync host permission was not granted.");
    }

    await setStorage({ syncConfig: config });
    await restoreSyncSettings();
    showSyncStatus("Sync settings saved.");
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("sync-mode").addEventListener("change", (event) => {
  updateSyncModeFields(event.target.value);
});

document.getElementById("btn-supabase-sign-in").addEventListener("click", async () => {
  try {
    const config = configForSave(getSyncConfigFromForm());
    if (config.mode !== SYNC_MODES.SUPABASE) {
      throw new Error("Switch sync mode to Supabase first.");
    }

    showSyncStatus("Signing in...");
    const password = document.getElementById("sync-password").value;
    const session = await signInWithSupabase(config, password);
    await setStorage({ syncConfig: config });
    document.getElementById("sync-password").value = "";
    await restoreSyncSettings();
    showSyncStatus(`Signed in${session.userEmail ? ` as ${session.userEmail}` : ""}.`);
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("btn-supabase-sign-up").addEventListener("click", async () => {
  try {
    const config = configForSave(getSyncConfigFromForm());
    if (config.mode !== SYNC_MODES.SUPABASE) {
      throw new Error("Switch sync mode to Supabase first.");
    }

    showSyncStatus("Creating account...");
    const password = document.getElementById("sync-password").value;
    const session = await signUpWithSupabase(config, password);
    await setStorage({ syncConfig: config });
    document.getElementById("sync-password").value = "";
    await restoreSyncSettings();
    showSyncStatus(session ? `Signed up${session.userEmail ? ` as ${session.userEmail}` : ""}.` : "Account created. Check your email to confirm it, then sign in.");
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("btn-supabase-reset").addEventListener("click", async () => {
  try {
    const config = configForSave(getSyncConfigFromForm());
    if (config.mode !== SYNC_MODES.SUPABASE) {
      throw new Error("Switch sync mode to Supabase first.");
    }

    showSyncStatus("Sending reset email...");
    await requestSupabasePasswordReset(config);
    await setStorage({ syncConfig: config });
    document.getElementById("sync-password").value = "";
    await restoreSyncSettings();
    showSyncStatus("Password reset email sent.");
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("btn-supabase-sign-out").addEventListener("click", async () => {
  try {
    const data = await getStorage();
    const config = data.syncConfig || configForSave(getSyncConfigFromForm());
    await signOutOfSupabase(config, data.syncSession || null);
    await restoreSyncSettings();
    showSyncStatus("Signed out.");
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("btn-sync-unlock").addEventListener("click", async () => {
  try {
    const data = await getStorage();
    const config = configForSave(getSyncConfigFromForm());
    if (config.mode !== SYNC_MODES.SUPABASE) {
      throw new Error("Switch sync mode to Supabase first.");
    }

    showSyncStatus("Opening checkout...");
    await setStorage({ syncConfig: config });
    const checkoutUrl = await createSyncUnlockCheckout(config, data.syncSession || null);
    await restoreSyncSettings();
    await openExternalUrl(checkoutUrl);
    showSyncStatus("Checkout opened. Sync will unlock after payment.");
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("btn-sync-now").addEventListener("click", async () => {
  try {
    showSyncStatus("Syncing...");
    const record = await syncNow();
    const data = await getStorage();
    renderSyncSummary(data);
    showSyncStatus(`Synced revision ${record.revision}.`);
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

document.getElementById("btn-prepare-migration").addEventListener("click", async () => {
  try {
    const report = await prepareLocalDataForSync();
    const data = await getStorage();
    renderSyncSummary(data);
    showSyncStatus(formatMigrationReport(report));
  } catch (error) {
    showSyncStatus(getErrorMessage(error), true);
  }
});

// --- Init ---

async function init() {
  const initialData = await ensureCurrentWeek();
  rolloverArchivedWeek = initialData.archivedWeek;

  if (rolloverArchivedWeek) {
    switchTab("history");
    await renderHistory();
  }

  const restoredDraft = await restoreAddDraft();
  await restoreSyncSettings();
  await prefillFromTab({ preserveDraftType: restoredDraft });
}

init();
