/* Media Log core: the data rules shared by the popup, the full-page views, and the checks.
   Pure functions only. Nothing here touches the DOM or chrome.* APIs. */
(function (root) {
  "use strict";

  // --- Entry types ---

  const ENTRY_TYPES = Object.freeze({
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
  });
  // Add and Edit menu order. Music and YouTube Video stay readable in old entries but are not offered.
  const SELECTABLE_TYPES = Object.freeze(["anime", "article", "book", "film", "game", "manga", "podcast", "tv"]);
  const SELECTABLE_SET = new Set(SELECTABLE_TYPES);
  const DEFAULT_ENTRY_TYPE = "article";

  const THEMES = new Set(["monet", "catppuccin", "tokyo-night", "dracula", "nier"]);
  const DEFAULT_THEME = "monet";

  const BACKUP_FORMAT = "media-log-backup";
  const BACKUP_VERSION = 1;
  const LIMITS = Object.freeze({
    backupBytes: 10 * 1024 * 1024,
    historyWeeks: 1_000,
    entriesPerWeek: 10_000,
    title: 5_000,
    // Room for long notebook notes (about 15,000 words).
    note: 100_000,
    url: 10_000,
    name: 200,
    parkedDrafts: 1_000,
  });

  const isWebUrl = (url) => /^https?:\/\//i.test(url || "");
  const normalizeSelectableType = (type) => (SELECTABLE_SET.has(type) ? type : DEFAULT_ENTRY_TYPE);
  const typeLabel = (type) => ENTRY_TYPES[type] || type;

  // --- Dates and ISO weeks ---

  const DAY_MS = 86_400_000;
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const pad2 = (value) => String(value).padStart(2, "0");

  // ISO week of the given local calendar day.
  function getISOWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    return { week: Math.ceil(((d - yearStart) / DAY_MS + 1) / 7), year: d.getUTCFullYear() };
  }

  function getWeekBounds(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const start = new Date(jan4);
    start.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start, end };
  }

  // YYYY-MM-DD from a UTC date (week bounds).
  const formatDate = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;

  // YYYY-MM-DD for the user's own calendar day. Using UTC here would log late-night entries on the wrong day.
  const localDateString = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

  const parseDay = (dateStr) => new Date(`${dateStr}T12:00:00Z`);

  function formatDateRange(start, end) {
    if (start.getUTCMonth() === end.getUTCMonth()) {
      return `${start.getUTCDate()}-${end.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`;
    }
    return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} - ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  }

  function formatDayHeader(dateStr) {
    const date = parseDay(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return `${WEEKDAYS[date.getUTCDay()]} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
  }

  function getWeekInfoForDate(dateStr) {
    const { week, year } = getISOWeek(parseDay(dateStr));
    const { start, end } = getWeekBounds(year, week);
    return { weekNumber: week, year, weekStart: formatDate(start), weekEnd: formatDate(end) };
  }

  function createWeek(year, weekNumber) {
    const { start, end } = getWeekBounds(year, weekNumber);
    return { weekStart: formatDate(start), weekEnd: formatDate(end), weekNumber, year, entries: [] };
  }

  const isSameWeek = (a, b) => Boolean(a && b) && a.weekNumber === b.weekNumber && a.year === b.year;
  const weekKey = (week) => `${week.year}-W${week.weekNumber}`;

  function weekLabel(week) {
    const { start, end } = getWeekBounds(week.year, week.weekNumber);
    return `Week ${week.weekNumber}, ${week.year} (${formatDateRange(start, end)})`;
  }

  const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

  // --- Week and entry state ---
  // `state` is { currentWeek, history }. These helpers mutate it in place and leave saving to the caller.

  // Stable sort by creation time; entries without a valid time keep their order at the end.
  function sortEntries(entries) {
    const sorted = entries
      .map((entry, index) => {
        const createdAt = Date.parse(entry.createdAt || "");
        return { entry, index, createdAt: Number.isFinite(createdAt) ? createdAt : Number.MAX_SAFE_INTEGER };
      })
      .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index)
      .map(({ entry }) => entry);
    entries.splice(0, entries.length, ...sorted);
  }

  function ensureHistoryWeek(state, info) {
    state.history = state.history || [];
    const existing = state.history.find((week) => isSameWeek(week, info));
    if (existing) {
      existing.weekStart = existing.weekStart || info.weekStart;
      existing.weekEnd = existing.weekEnd || info.weekEnd;
      return existing;
    }
    const week = { weekStart: info.weekStart, weekEnd: info.weekEnd, weekNumber: info.weekNumber, year: info.year, entries: [] };
    state.history.unshift(week);
    return week;
  }

  function placeEntryInWeek(state, entry) {
    const targetWeek = getWeekInfoForDate(entry.date);
    const movedToCurrentWeek = isSameWeek(state.currentWeek, targetWeek);
    const bucket = movedToCurrentWeek ? state.currentWeek : ensureHistoryWeek(state, targetWeek);
    bucket.entries.push(entry);
    sortEntries(bucket.entries);
    return { movedToCurrentWeek, targetWeek };
  }

  // Older entries had no createdAt. Give them stable, ordered placeholder times once.
  function normalizeCreatedAt(state) {
    let changed = false;
    let legacyIndex = 0;
    const legacyBaseTime = Date.UTC(2000, 0, 1);
    for (const entries of [state.currentWeek?.entries, ...(state.history || []).map((week) => week.entries)]) {
      for (const entry of entries || []) {
        if (!entry.createdAt) {
          entry.createdAt = new Date(legacyBaseTime + legacyIndex).toISOString();
          changed = true;
        }
        legacyIndex += 1;
      }
    }
    return changed;
  }

  // Move a stale current week into history when a new ISO week starts. Empty weeks are dropped.
  // History keeps one record per ISO week: if that week is already archived (the retired
  // Start New Week button could split a week), the entries join it instead of duplicating it.
  function rollWeek(state, now = new Date()) {
    const { week, year } = getISOWeek(now);
    if (state.currentWeek && state.currentWeek.weekNumber === week && state.currentWeek.year === year) {
      return { changed: false, archivedWeek: null };
    }
    state.history = state.history || [];
    let archivedWeek = null;
    if (state.currentWeek?.entries?.length) {
      archivedWeek = state.history.find((item) => isSameWeek(item, state.currentWeek)) || null;
      if (archivedWeek) {
        archivedWeek.entries.push(...state.currentWeek.entries);
        sortEntries(archivedWeek.entries);
      } else {
        archivedWeek = state.currentWeek;
        state.history.unshift(archivedWeek);
      }
    }
    state.currentWeek = createWeek(year, week);
    return { changed: true, archivedWeek };
  }

  const emptyDraft = (overrides = {}) => ({ url: "", title: "", type: DEFAULT_ENTRY_TYPE, date: "", rating: "", note: "", ...overrides });

  // Decide what fills the Add form when the popup opens on `pageUrl`. A draft resumes on its own
  // page (or when there is no web page to read). On a different web page, the open page wins: the
  // draft joins the set-aside list (newest first), and an entry set aside earlier for this page comes back.
  // Returns { form, parked, changed }; `form` is null when the page should fill the form.
  function planDrafts(addDraft, parked = [], pageUrl = "") {
    const onWebPage = isWebUrl(pageUrl);
    if (addDraft && !(addDraft.url && onWebPage && addDraft.url !== pageUrl)) {
      return { form: addDraft, parked, changed: false };
    }
    const list = addDraft ? [addDraft, ...parked] : [...parked];
    const index = onWebPage ? list.findIndex((draft) => draft.url === pageUrl) : -1;
    const form = index >= 0 ? list.splice(index, 1)[0] : null;
    return { form, parked: list, changed: Boolean(addDraft) || index >= 0 };
  }

  // Restore: the newest set-aside entry fills the form. A draft already in the form goes to the back
  // of the list, so repeated Restores step through every entry and nothing is dropped.
  function restoreParked(current, parked) {
    const [form, ...rest] = parked;
    return form ? { form, parked: current ? [...rest, current] : rest } : null;
  }

  // Turn raw form values into a stored entry. Returns null when the title or date is missing.
  function buildEntry(fields, createdAt) {
    const title = (fields.title || "").trim();
    const date = fields.date || "";
    if (!title || !date) return null;
    const entry = { type: fields.type, title, date, createdAt };
    const url = (fields.url || "").trim();
    const note = (fields.note || "").trim();
    if (url) entry.url = url;
    if (fields.rating) entry.rating = Number.parseInt(fields.rating, 10);
    if (note) entry.note = note;
    return entry;
  }

  function entryMeta(entry) {
    const label = typeLabel(entry.type);
    return entry.rating ? `${label} — ${entry.rating}/10` : label;
  }

  // Group items by calendar day, oldest day first.
  function groupByDay(items, getDate = (item) => item.date) {
    const groups = new Map();
    for (const item of items) {
      const date = getDate(item);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }

  function weekExport(week) {
    const bounds = getWeekBounds(week.year, week.weekNumber);
    return {
      filename: `media-log-${week.year}-w${pad2(week.weekNumber)}.json`,
      data: {
        week: week.weekNumber,
        year: week.year,
        start: week.weekStart || formatDate(bounds.start),
        end: week.weekEnd || formatDate(bounds.end),
        entries: week.entries,
      },
    };
  }

  // --- History search ---

  const parseSearch = (query) => (query || "").toLowerCase().split(/\s+/).filter(Boolean);

  // Lowercased search text per entry object, so typing in the search box does not rebuild it every keystroke.
  const searchText = new WeakMap();

  // Every token must appear somewhere in the title, note, URL, or type label.
  function entryMatchesSearch(entry, tokens) {
    let haystack = searchText.get(entry);
    if (haystack === undefined) {
      haystack = [entry.title, entry.note, entry.url, typeLabel(entry.type)].filter(Boolean).join("\n").toLowerCase();
      searchText.set(entry, haystack);
    }
    return tokens.every((token) => haystack.includes(token));
  }

  // --- Backup validation ---

  function assertBackup(condition, message) {
    if (!condition) throw new Error(message);
  }

  const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const isBlank = (value) => value === undefined || value === null || value === "";

  function validateString(value, label, maxLength, { allowEmpty = false } = {}) {
    assertBackup(typeof value === "string", `${label} must be text.`);
    assertBackup(value.length <= maxLength, `${label} is too long.`);
    assertBackup(allowEmpty || value.trim().length > 0, `${label} cannot be empty.`);
    return value;
  }

  const validateOptionalString = (value, label, maxLength) => (isBlank(value) ? undefined : validateString(value, label, maxLength));

  function validateDateString(value, label, { allowEmpty = false } = {}) {
    if (allowEmpty && value === "") return "";
    const date = validateString(value, label, 10);
    assertBackup(/^\d{4}-\d{2}-\d{2}$/.test(date), `${label} must use YYYY-MM-DD.`);
    assertBackup(!Number.isNaN(Date.parse(`${date}T12:00:00Z`)), `${label} is not a valid date.`);
    return date;
  }

  function validateRating(value, label, { allowEmpty = false } = {}) {
    if (allowEmpty && isBlank(value)) return undefined;
    const rating = Number(value);
    assertBackup(Number.isInteger(rating) && rating >= 1 && rating <= 10, `${label} must be from 1 to 10.`);
    return rating;
  }

  function validateHttpUrl(value, label) {
    if (isBlank(value)) return undefined;
    const url = validateString(value, label, LIMITS.url);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`${label} is not a valid URL.`);
    }
    assertBackup(["http:", "https:"].includes(parsed.protocol), `${label} must use HTTP or HTTPS.`);
    return url;
  }

  function validateTimestamp(value, label) {
    if (isBlank(value)) return undefined;
    const timestamp = validateString(value, label, 100);
    assertBackup(!Number.isNaN(Date.parse(timestamp)), `${label} is not a valid timestamp.`);
    return timestamp;
  }

  function validateEntry(value, label) {
    assertBackup(isPlainObject(value), `${label} must be an object.`);
    const type = validateString(value.type, `${label} type`, 30);
    assertBackup(Object.hasOwn(ENTRY_TYPES, type), `${label} has an unknown type.`);

    const entry = {
      type,
      title: validateString(value.title, `${label} title`, LIMITS.title),
      date: validateDateString(value.date, `${label} date`),
    };
    const url = validateHttpUrl(value.url, `${label} URL`);
    const rating = validateRating(value.rating, `${label} rating`, { allowEmpty: true });
    const note = validateOptionalString(value.note, `${label} note`, LIMITS.note);
    const createdAt = validateTimestamp(value.createdAt, `${label} creation time`);

    if (url) entry.url = url;
    if (rating !== undefined) entry.rating = rating;
    if (note !== undefined) entry.note = note;
    if (createdAt) entry.createdAt = createdAt;
    return entry;
  }

  function validateWeek(value, label) {
    assertBackup(isPlainObject(value), `${label} must be an object.`);
    assertBackup(Number.isInteger(value.year) && value.year >= 2000 && value.year <= 2100, `${label} has an invalid year.`);
    assertBackup(Number.isInteger(value.weekNumber) && value.weekNumber >= 1 && value.weekNumber <= 53, `${label} has an invalid week number.`);
    assertBackup(Array.isArray(value.entries), `${label} entries must be a list.`);
    assertBackup(value.entries.length <= LIMITS.entriesPerWeek, `${label} contains too many entries.`);

    return {
      weekStart: validateDateString(value.weekStart, `${label} start date`),
      weekEnd: validateDateString(value.weekEnd, `${label} end date`),
      weekNumber: value.weekNumber,
      year: value.year,
      entries: value.entries.map((entry, index) => validateEntry(entry, `${label}, entry ${index + 1}`)),
    };
  }

  function validateDraft(value) {
    if (value === undefined || value === null) return undefined;
    assertBackup(isPlainObject(value), "Draft must be an object.");
    const type = validateString(value.type || DEFAULT_ENTRY_TYPE, "Draft type", 30);
    assertBackup(Object.hasOwn(ENTRY_TYPES, type), "Draft has an unknown type.");

    return {
      type,
      title: validateString(value.title || "", "Draft title", LIMITS.title, { allowEmpty: true }),
      date: validateDateString(value.date || "", "Draft date", { allowEmpty: true }),
      note: validateString(value.note || "", "Draft note", LIMITS.note, { allowEmpty: true }),
      rating: value.rating === "" ? "" : validateRating(value.rating, "Draft rating", { allowEmpty: true }) || "",
      url: validateHttpUrl(value.url, "Draft URL") || "",
    };
  }

  function validateBackup(value) {
    assertBackup(isPlainObject(value), "Backup must be a JSON object.");
    assertBackup(value.format === BACKUP_FORMAT, "This is not a Media Log full backup.");
    assertBackup(value.version === BACKUP_VERSION, `Backup version must be ${BACKUP_VERSION}.`);
    assertBackup(isPlainObject(value.data), "Backup data is missing.");
    assertBackup(Array.isArray(value.data.history), "Backup history must be a list.");
    assertBackup(value.data.history.length <= LIMITS.historyWeeks, "Backup contains too many archived weeks.");

    const data = {
      currentWeek: validateWeek(value.data.currentWeek, "Current week"),
      history: value.data.history.map((week, index) => validateWeek(week, `History week ${index + 1}`)),
      userName: validateString(value.data.userName || "", "Name", LIMITS.name, { allowEmpty: true }),
      theme: validateString(value.data.theme || DEFAULT_THEME, "Theme", 30),
    };
    assertBackup(THEMES.has(data.theme), "Backup has an unknown theme.");

    const addDraft = validateDraft(value.data.addDraft);
    if (addDraft) data.addDraft = addDraft;

    if (value.data.parkedDrafts !== undefined) {
      assertBackup(Array.isArray(value.data.parkedDrafts), "Set-aside entries must be a list.");
      assertBackup(value.data.parkedDrafts.length <= LIMITS.parkedDrafts, "Backup contains too many set-aside entries.");
      const parked = value.data.parkedDrafts.map((draft) => validateDraft(draft)).filter(Boolean);
      if (parked.length) data.parkedDrafts = parked;
    }
    return data;
  }

  // Drafts keep only web links in a backup; any other URL would make the whole file fail to import.
  const portableDraft = (draft) => (draft ? { ...draft, url: isWebUrl(draft.url) ? draft.url : "" } : draft);

  function createBackup(stored, now = new Date()) {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      data: {
        currentWeek: stored.currentWeek,
        history: stored.history || [],
        addDraft: portableDraft(stored.addDraft),
        ...(stored.parkedDrafts?.length ? { parkedDrafts: stored.parkedDrafts.map(portableDraft) } : {}),
        userName: stored.userName || "",
        theme: THEMES.has(stored.theme) ? stored.theme : DEFAULT_THEME,
      },
    };
  }

  const countBackupEntries = (data) =>
    (data.currentWeek?.entries?.length || 0) + (data.history || []).reduce((total, week) => total + week.entries.length, 0);

  // JSON with sorted keys, so two copies of the same data always compare equal.
  function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    if (isPlainObject(value)) {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function verifyPortableStorage(expected, actual) {
    assertBackup(
      stableSerialize(actual) === stableSerialize(expected),
      "Import verification failed. Your previous Media Log data was not reported as replaced.",
    );
    return actual;
  }

  function describeBackupCoverage(data) {
    const history = data.history || [];
    const historyWeeks = history.map((week) => week.weekNumber).sort((a, b) => a - b);
    const sameYear = history.every((week) => week.year === data.currentWeek.year);
    const historyLabel = sameYear && historyWeeks.length > 1
      ? `Weeks ${historyWeeks[0]}-${historyWeeks.at(-1)}`
      : `${history.length} archived weeks`;
    return `Verified ${countBackupEntries(data)} entries. Archived ${historyLabel}; current Week ${data.currentWeek.weekNumber} has ${data.currentWeek.entries.length} entries.`;
  }

  root.MediaLogCore = Object.freeze({
    ENTRY_TYPES, SELECTABLE_TYPES, DEFAULT_ENTRY_TYPE, THEMES, DEFAULT_THEME, BACKUP_FORMAT, BACKUP_VERSION, LIMITS,
    normalizeSelectableType, typeLabel, pluralize, isWebUrl,
    getISOWeek, getWeekBounds, formatDate, localDateString, formatDateRange, formatDayHeader, getWeekInfoForDate,
    createWeek, isSameWeek, weekKey, weekLabel,
    sortEntries, ensureHistoryWeek, placeEntryInWeek, normalizeCreatedAt, rollWeek,
    emptyDraft, planDrafts, restoreParked, buildEntry, entryMeta, groupByDay, weekExport,
    parseSearch, entryMatchesSearch,
    assertBackup, validateBackup, createBackup, countBackupEntries, stableSerialize, verifyPortableStorage, describeBackupCoverage,
  });
})(globalThis);
