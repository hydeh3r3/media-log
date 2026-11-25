/* Media Log popup. The same page also runs two full-tab views:
   ?transfer=1 imports a backup, and ?notebook=1 writes the Add draft's note on a full page.
   Data rules live in core.js; the editor lives in notebook.js. */
"use strict";

// Apply the saved theme before first paint to avoid a flash.
// localStorage only mirrors chrome.storage, which stays the source of truth.
try {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
} catch {}

const Core = MediaLogCore;
const { DEFAULT_ENTRY_TYPE, DEFAULT_THEME, LIMITS, SELECTABLE_TYPES, THEMES, localDateString, pluralize } = Core;

const pageParams = new URLSearchParams(globalThis.location?.search || "");
const PAGE = pageParams.get("transfer") === "1" ? "transfer" : pageParams.get("notebook") === "1" ? "notebook" : "popup";
const TRANSFER_PAGE_PATH = "popup.html?transfer=1";
const NOTEBOOK_PAGE_PATH = "popup.html?notebook=1";
const BRIDGE_URLS = ["http://127.0.0.1:43187", "http://localhost:43187"];
const PORTABLE_KEYS = ["currentWeek", "history", "addDraft", "userName", "theme"];
const DRAFT_FIELDS = ["url", "title", "type", "date", "rating", "note"];
const SAVE_DELAY_MS = 300;
const SEARCH_DELAY_MS = 120;
const LONG_NOTE_CHARS = 280;

const $ = (id) => document.getElementById(id);

// --- Small utilities ---

const storage = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

function debounce(fn, wait) {
  let timer = 0;
  let args = [];
  const run = () => {
    timer = 0;
    return fn(...args);
  };
  const debounced = (...callArgs) => {
    args = callArgs;
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  };
  debounced.flush = () => {
    if (!timer) return undefined;
    clearTimeout(timer);
    return run();
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = 0;
  };
  return debounced;
}

// Draft writes run one at a time, so a slow earlier save never lands after a newer one.
let draftWrites = Promise.resolve();
function queueDraftWrite(task) {
  const next = draftWrites.then(task);
  draftWrites = next.catch(() => {});
  return next;
}

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

const statusTimers = new WeakMap();
function flashStatus(element, message, duration = 2000) {
  setStatus(element, message);
  clearTimeout(statusTimers.get(element));
  statusTimers.set(element, setTimeout(() => setStatus(element, ""), duration));
}

const errorMessage = (error) => (error instanceof Error ? error.message : "Something went wrong.");

function downloadJson(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Toast (used for Undo) ---

let toastTimer = 0;
let toastAction = null;

function showToast(message, { actionLabel = "", onAction = null, duration = 6000 } = {}) {
  const toast = $("toast");
  toast.querySelector(".toast-message").textContent = message;
  const button = toast.querySelector(".toast-action");
  button.textContent = actionLabel;
  button.hidden = !actionLabel;
  toastAction = onAction;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  $("toast").hidden = true;
  toastAction = null;
}

// --- Theme, name, tabs ---

function applyTheme(theme) {
  const value = THEMES.has(theme) ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem("theme", value);
  } catch {}
  const select = $("theme-select");
  if (select) select.value = value;
  return value;
}

function renderGreeting(name) {
  const trimmed = (name || "").trim();
  $("greeting").textContent = trimmed
    ? `Hey ${trimmed}, time to log what you enjoyed this week!`
    : "Hey, time to log what you enjoyed this week!";
}

const saveNameSoon = debounce((userName) => storage.set({ userName }), SAVE_DELAY_MS);

function switchTab(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const content of document.querySelectorAll(".tab-content")) {
    content.classList.toggle("active", content.id === `tab-${name}`);
  }
  $("btn-settings").classList.toggle("active", name === "settings");
}

async function openTab(name) {
  switchTab(name);
  if (name === "week" || name === "history") await ensureCurrentWeek();
  if (name === "week") renderWeek();
  if (name === "history") renderHistory();
}

const isTabActive = (name) => $(`tab-${name}`).classList.contains("active");

function renderVisibleLists() {
  if (isTabActive("week")) renderWeek();
  if (isTabActive("history")) renderHistory();
}

function fillTypeMenus() {
  for (const select of document.querySelectorAll("select[data-type-menu]")) {
    select.replaceChildren(
      ...SELECTABLE_TYPES.map((type) => new Option(Core.typeLabel(type), type, type === DEFAULT_ENTRY_TYPE, type === DEFAULT_ENTRY_TYPE)),
    );
  }
}

// --- Week state ---
// While the popup is open it is the only writer of currentWeek and history,
// so it reads them once, keeps them in memory, and writes every change through.

const state = { currentWeek: null, history: [] };
let rolloverArchivedWeek = null;

const persistState = () => storage.set({ currentWeek: state.currentWeek, history: state.history });

async function loadState(stored) {
  state.currentWeek = stored.currentWeek || null;
  state.history = stored.history || [];
  const normalized = Core.normalizeCreatedAt(state);
  const { changed, archivedWeek } = Core.rollWeek(state);
  if (normalized || changed) await persistState();
  return archivedWeek;
}

// Start the new ISO week if the popup stayed open past Sunday night. Returns true when it rolled over.
async function ensureCurrentWeek() {
  const { changed, archivedWeek } = Core.rollWeek(state);
  if (!changed) return false;
  if (archivedWeek) rolloverArchivedWeek = archivedWeek;
  await persistState();
  return true;
}

// --- Add form and draft ---

let metadataRequest = 0;
const fieldEdits = { title: 0, url: 0, type: 0 };
let activeTabId = null;

const draftField = (name) => $(`entry-${name}`);

function readDraft() {
  const draft = {};
  for (const name of DRAFT_FIELDS) draft[name] = draftField(name).value;
  return draft;
}

function writeDraft(draft) {
  for (const name of DRAFT_FIELDS) draftField(name).value = draft[name] || "";
  draftField("type").value = Core.normalizeSelectableType(draft.type);
}

// Returns true when the draft names a page, so its saved type should win over detection.
function restoreDraft(addDraft) {
  if (!addDraft) return false;
  writeDraft(addDraft);
  return Boolean(addDraft.url || addDraft.title);
}

function saveDraftNow() {
  const draft = readDraft();
  return queueDraftWrite(() => storage.set({ addDraft: draft })).then(
    () => reportDraftState("saved"),
    () => reportDraftState("error"),
  );
}

const saveDraftSoon = debounce(saveDraftNow, SAVE_DELAY_MS);

function bindDraftFields() {
  for (const name of DRAFT_FIELDS) {
    const recordEdit = () => {
      if (name in fieldEdits) fieldEdits[name] += 1;
      reportDraftState("saving");
      saveDraftSoon();
    };
    draftField(name).addEventListener("input", recordEdit);
    draftField(name).addEventListener("change", recordEdit);
  }
}

// Read page metadata in the extension's isolated world.
async function extractPageSignals(tabId) {
  if (typeof tabId !== "number" || !chrome.scripting?.executeScript) return null;
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: MediaLogMetadata.collectPageSignals });
    return injection?.result || null;
  } catch {
    return null;
  }
}

// Fill the URL and title from the active tab, then suggest a type from the page.
// Anything you type while the page is being read wins over the lookup.
async function prefillFromTab({ preserveDraftType = false, tabQuery = null } = {}) {
  const request = ++metadataRequest;
  const titleInput = draftField("title");
  const urlInput = draftField("url");
  const typeInput = draftField("type");
  const dateInput = draftField("date");
  const initial = { title: titleInput.value, url: urlInput.value, type: typeInput.value, edits: { ...fieldEdits } };
  if (!dateInput.value) dateInput.value = localDateString();
  const isStale = () => request !== metadataRequest || fieldEdits.url !== initial.edits.url;

  try {
    const [tab] = await (tabQuery || chrome.tabs.query({ active: true, currentWindow: true }));
    if (typeof tab?.id === "number") activeTabId = tab.id;
    if (!tab || isStale() || (initial.url && initial.url !== tab.url)) return;
    if (!initial.url) urlInput.value = tab.url || "";
    // Fill the title immediately, including site-specific cleanup, before reading the page.
    if (!initial.title && fieldEdits.title === initial.edits.title) {
      titleInput.value = MediaLogMetadata.detect({ url: tab.url, title: tab.title || "" }).title;
    }
    if (!/^https?:\/\//i.test(tab.url || "")) return;

    const signals = await extractPageSignals(tab.id);
    if (isStale() || urlInput.value !== tab.url) return;
    // A navigation during injection must not mix one page's URL with another page's title.
    if (signals?.url && signals.url !== tab.url) return;
    const typeUntouched = fieldEdits.type === initial.edits.type && (!initial.type || initial.type === DEFAULT_ENTRY_TYPE);
    if (!preserveDraftType && typeUntouched) {
      const { type } = MediaLogMetadata.detect({ url: tab.url, title: tab.title, signals });
      if (SELECTABLE_TYPES.includes(type)) typeInput.value = type;
    }
  } catch {
    // Missing page permissions leave the editable fields available.
  }
}

let addingEntry = false;

async function addEntry(event) {
  event.preventDefault();
  if (addingEntry) return;
  const entry = Core.buildEntry(readDraft(), new Date().toISOString());
  if (!entry) return;

  addingEntry = true;
  $("btn-add").disabled = true;
  try {
    await ensureCurrentWeek();
    const { targetWeek } = Core.placeEntryInWeek(state, entry);
    saveDraftSoon.cancel();
    await persistState();
    await queueDraftWrite(() => storage.remove("addDraft"));
    writeDraft(Core.emptyDraft({ date: localDateString() }));
    flashStatus($("add-status"), `Added "${entry.title}" to Week ${targetWeek.weekNumber}`);
    await prefillFromTab();
  } catch (error) {
    setStatus($("add-status"), errorMessage(error), true);
  } finally {
    addingEntry = false;
    $("btn-add").disabled = false;
  }
}

// --- Entry rendering (This Week and History) ---

function renderDayGroup(date, items) {
  const group = el("div", "day-group");
  const body = el("div", "day-group-body");
  body.append(...items);
  group.append(el("div", "day-separator", Core.formatDayHeader(date)), body);
  return group;
}

const isLongNote = (note) => note.length > LONG_NOTE_CHARS || note.split("\n").length > 4;

// Notes render their Markdown. Long notes in This Week start folded.
function renderNote(note, { fold = false } = {}) {
  const body = el("div", "entry-note md");
  body.append(MediaLogNotebook.renderMarkdown(note));
  if (!fold || !isLongNote(note)) return [body];
  body.classList.add("is-folded");
  const more = el("button", "note-more", "Show more");
  more.type = "button";
  more.dataset.action = "toggle-note";
  more.setAttribute("aria-expanded", "false");
  return [body, more];
}

function toggleNote(button) {
  const expanded = !button.previousElementSibling.classList.toggle("is-folded");
  button.textContent = expanded ? "Show less" : "Show more";
  button.setAttribute("aria-expanded", String(expanded));
}

function actionButton(action, index) {
  const button = el("button", `btn-${action}`, action);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.index = String(index);
  return button;
}

function renderWeekEntry(entry, index) {
  const item = el("div", "entry-item");
  item.dataset.index = String(index);
  item.append(el("div", "entry-title", entry.title), el("div", "entry-meta", Core.entryMeta(entry)));
  if (entry.note) item.append(...renderNote(entry.note, { fold: true }));
  const actions = el("div", "entry-actions");
  actions.append(actionButton("edit", index), actionButton("delete", index));
  item.append(actions);
  return item;
}

function renderWeek() {
  hideEditForm(); // Keep the shared edit form out of the nodes about to be replaced.
  const week = state.currentWeek;
  $("week-header").textContent = `${Core.weekLabel(week)} — ${pluralize(week.entries.length, "entry", "entries")}`;

  const container = $("week-entries");
  if (!week.entries.length) {
    container.replaceChildren(el("div", "empty", "No entries yet."));
    return;
  }
  // Indexes point into currentWeek.entries for the edit and delete buttons.
  const indexed = week.entries.map((entry, index) => ({ entry, index }));
  const fragment = document.createDocumentFragment();
  for (const [date, items] of Core.groupByDay(indexed, (item) => item.entry.date)) {
    fragment.append(renderDayGroup(date, items.map(({ entry, index }) => renderWeekEntry(entry, index))));
  }
  container.replaceChildren(fragment);
}

function onWeekClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === "edit") startEdit(index);
  else if (button.dataset.action === "delete") deleteEntry(index);
  else if (button.dataset.action === "toggle-note") toggleNote(button);
}

// --- Edit and delete ---

let editIndex = -1;
const EDIT_FIELDS = ["title", "url", "type", "date", "rating", "note"];
const editField = (name) => $(`edit-${name}`);

async function startEdit(index) {
  if (await ensureCurrentWeek()) {
    renderWeek();
    return;
  }
  const entry = state.currentWeek.entries[index];
  if (!entry) return;

  editIndex = index;
  for (const name of EDIT_FIELDS) editField(name).value = entry[name] ?? "";
  editField("type").value = Core.normalizeSelectableType(entry.type);

  for (const element of document.querySelectorAll(".entry-item.editing")) element.classList.remove("editing");
  const form = $("edit-form");
  const entryElement = document.querySelector(`.entry-item[data-index="${index}"]`);
  if (entryElement) {
    entryElement.classList.add("editing");
    entryElement.after(form);
  }
  form.hidden = false;
  editField("title").focus();
}

function hideEditForm() {
  editIndex = -1;
  const form = $("edit-form");
  form.hidden = true;
  $("week-entries").after(form);
  for (const element of document.querySelectorAll(".entry-item.editing")) element.classList.remove("editing");
}

async function saveEdit(event) {
  event.preventDefault();
  const index = editIndex;
  if (index < 0) return;
  if (await ensureCurrentWeek()) {
    renderWeek();
    return;
  }
  const entry = state.currentWeek.entries[index];
  if (!entry) return;

  const fields = Object.fromEntries(EDIT_FIELDS.map((name) => [name, editField(name).value]));
  const updated = Core.buildEntry(fields, entry.createdAt);
  if (!updated) return;

  state.currentWeek.entries.splice(index, 1);
  const { movedToCurrentWeek } = Core.placeEntryInWeek(state, updated);
  await persistState();
  hideEditForm();

  if (movedToCurrentWeek) {
    renderWeek();
  } else {
    switchTab("history");
    renderHistory();
  }
}

async function deleteEntry(index) {
  if (await ensureCurrentWeek()) {
    renderWeek();
    return;
  }
  const [removed] = state.currentWeek.entries.splice(index, 1);
  if (!removed) return;
  await persistState();
  renderWeek();
  showToast(`Deleted "${removed.title}"`, {
    actionLabel: "Undo",
    onAction: async () => {
      await ensureCurrentWeek();
      Core.placeEntryInWeek(state, removed);
      await persistState();
      renderVisibleLists();
    },
  });
}

// --- Week actions and publishing ---

async function publishWeek(week) {
  const body = JSON.stringify({
    weekNumber: week.weekNumber,
    year: week.year,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    entries: week.entries,
  });

  let lastError = "Publish bridge is not running.";
  for (const baseUrl of BRIDGE_URLS) {
    let response;
    try {
      response = await fetch(`${baseUrl}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    } catch (error) {
      // Only an unreachable address moves on to the next one.
      lastError = error instanceof Error ? error.message : "Publish failed.";
      continue;
    }
    // The bridge answered, so don't send the same week again through its other address.
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `Publish failed with ${response.status}`);
    return result;
  }
  throw new Error(`${lastError.replace(/\.?$/, ".")} Run "bun run publish:bridge" in the website repo first.`);
}

async function publishCurrentWeek() {
  await ensureCurrentWeek();
  const status = $("week-publish-status");
  try {
    setStatus(status, "Publishing current week...");
    const result = await publishWeek(state.currentWeek);
    setStatus(status, `Published "${result.title}" to website files.`);
  } catch (error) {
    setStatus(status, errorMessage(error), true);
  }
}

async function exportCurrentWeek() {
  await ensureCurrentWeek();
  const { filename, data } = Core.weekExport(state.currentWeek);
  downloadJson(filename, data);
}

// --- History ---

// Publish messages are keyed by week so they survive re-renders from searching or switching tabs.
const historyPublishStatuses = new Map();
// Each rendered <details> remembers its week and the entries it should show.
const historyWeekData = new WeakMap();

function showHistoryPublishStatus(key, message, isError = false) {
  historyPublishStatuses.set(key, { message, isError });
  for (const status of document.querySelectorAll(`.history-week-status[data-week="${key}"]`)) setStatus(status, message, isError);
}

function clearHistoryPublishStatuses() {
  historyPublishStatuses.clear();
  for (const status of document.querySelectorAll(".history-week-status")) setStatus(status, "");
}

function renderHistoryEntry(entry) {
  const meta = el("div", "entry-meta", Core.entryMeta(entry));
  if (!entry.note) {
    const item = el("div", "entry-item");
    item.append(el("div", "entry-title", entry.title), meta);
    return item;
  }
  // Notes stay folded under the entry title until it is opened.
  const item = el("details", "entry-item history-note");
  const heading = el("summary");
  heading.append(el("span", "entry-title", entry.title), meta);
  item.append(heading, ...renderNote(entry.note));
  return item;
}

// Entries render the first time a week opens, so a long history opens instantly.
function fillHistoryWeek(details) {
  const data = historyWeekData.get(details);
  if (!data || data.filled) return;
  data.filled = true;
  const fragment = document.createDocumentFragment();
  for (const [date, entries] of Core.groupByDay(data.entries)) {
    fragment.append(renderDayGroup(date, entries.map((entry) => renderHistoryEntry(entry))));
  }
  details.querySelector(".history-entries").replaceChildren(fragment);
}

function renderHistoryWeek(week, entries, searching) {
  const details = el("details", "history-week");
  const count = searching
    ? `${entries.length} of ${pluralize(week.entries.length, "entry", "entries")}`
    : pluralize(week.entries.length, "entry", "entries");

  const publish = el("button", "btn btn-small", "Publish");
  publish.type = "button";
  publish.dataset.action = "publish";
  const actions = el("span", "history-summary-actions");
  actions.append(publish);

  const key = Core.weekKey(week);
  const status = el("span", "history-week-status");
  status.dataset.week = key;
  const saved = historyPublishStatuses.get(key);
  if (saved) setStatus(status, saved.message, saved.isError);

  const summary = el("summary");
  summary.append(el("span", "history-summary-title", `${Core.weekLabel(week)} — ${count}`), actions, status);
  details.append(summary, el("div", "history-entries"));

  historyWeekData.set(details, { week, entries, filled: false });
  if (searching) {
    details.open = true;
    fillHistoryWeek(details);
  }
  return details;
}

function renderHistory() {
  const history = state.history;
  const notice = $("history-notice");
  notice.hidden = !rolloverArchivedWeek;
  notice.textContent = rolloverArchivedWeek
    ? `Week ${rolloverArchivedWeek.weekNumber}, ${rolloverArchivedWeek.year} was moved here when the new ISO week started. You can still publish it below.`
    : "";

  const search = $("history-search");
  const container = $("history-list");
  const empty = $("history-empty");
  search.hidden = history.length === 0;

  const tokens = Core.parseSearch(search.value);
  const searching = tokens.length > 0;
  const fragment = document.createDocumentFragment();
  for (const week of history) {
    const entries = searching ? week.entries.filter((entry) => Core.entryMatchesSearch(entry, tokens)) : week.entries;
    if (!searching || entries.length) fragment.append(renderHistoryWeek(week, entries, searching));
  }
  container.replaceChildren(fragment);

  empty.textContent = history.length ? "No entries match." : "No archived weeks yet.";
  empty.hidden = container.childElementCount > 0;
}

const renderHistorySoon = debounce(renderHistory, SEARCH_DELAY_MS);

async function publishHistoryWeek(details) {
  const week = historyWeekData.get(details)?.week;
  if (!week) return;
  const key = Core.weekKey(week);
  clearHistoryPublishStatuses();
  showHistoryPublishStatus(key, `Publishing Week ${week.weekNumber}...`);
  try {
    const result = await publishWeek(week);
    showHistoryPublishStatus(key, `Published "${result.title}" to website files.`);
  } catch (error) {
    showHistoryPublishStatus(key, errorMessage(error), true);
  }
}

function onHistoryClick(event) {
  // The publish message sits in the summary row; clicking it should not fold the week.
  if (event.target.closest(".history-week-status")) {
    event.preventDefault();
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "publish") {
    event.preventDefault();
    publishHistoryWeek(button.closest(".history-week"));
  } else if (button.dataset.action === "toggle-note") {
    toggleNote(button);
  }
}

// --- Full backup transfer ---

function flushPendingSaves() {
  saveDraftSoon.flush();
  saveNameSoon.flush();
  pageNoteSave?.flush();
  return draftWrites;
}

async function exportBackup() {
  const status = $("backup-status");
  try {
    await flushPendingSaves();
    const backup = Core.createBackup(await storage.get(PORTABLE_KEYS));
    downloadJson(`media-log-full-backup-${localDateString()}.json`, backup);
    setStatus(status, `Exported ${pluralize(Core.countBackupEntries(backup.data), "entry", "entries")}.`);
  } catch (error) {
    setStatus(status, errorMessage(error), true);
  }
}

async function onImportClick() {
  if (PAGE !== "transfer") {
    await chrome.tabs.create({ url: chrome.runtime.getURL(TRANSFER_PAGE_PATH) });
    return;
  }
  $("backup-file").click();
}

async function importBackupFile() {
  const input = $("backup-file");
  const status = $("backup-status");
  try {
    const [file] = input.files || [];
    if (!file) return;
    Core.assertBackup(file.size <= LIMITS.backupBytes, "Backup is larger than 10 MB.");
    const data = Core.validateBackup(JSON.parse(await file.text()));

    // Import replaces everything, including a draft the backup does not have.
    await storage.set(data);
    if (!data.addDraft) await storage.remove("addDraft");
    Core.verifyPortableStorage(data, await storage.get(PORTABLE_KEYS));

    applyTheme(data.theme);
    $("user-name").value = data.userName;
    renderGreeting(data.userName);
    setStatus(status, `${Core.describeBackupCoverage(data)} You can close this tab and reopen Media Log.`);
  } catch (error) {
    setStatus(status, errorMessage(error), true);
  } finally {
    input.value = "";
  }
}

// --- Notebook ---

let notebook = null;
let notebookSource = null; // The form textarea the popup notebook is editing.
let pageNoteSave = null; // Debounced save on the full-page notebook.

function reportDraftState(saveState) {
  if (notebookSource?.id === "entry-note") notebook.setSaveState(saveState);
}

// Runs inside the page. Prefers a playing video, then the one furthest along.
function readPageVideoTime() {
  const videos = Array.from(document.querySelectorAll("video")).filter((video) => video.currentTime > 0 || !video.paused);
  if (!videos.length) return null;
  const video = videos.find((item) => !item.paused) || videos.sort((a, b) => b.currentTime - a.currentTime)[0];
  return { time: video.currentTime, playing: !video.paused };
}

async function readVideoTime(tabId) {
  if (typeof tabId !== "number" || !chrome.scripting?.executeScript) return null;
  const inject = (allFrames) => chrome.scripting.executeScript({ target: { tabId, allFrames }, func: readPageVideoTime });
  // Players often sit in an iframe; fall back to the top page if frames are off limits.
  const results = await inject(true).catch(() => inject(false));
  const found = results.map((item) => item?.result).filter((item) => item && Number.isFinite(item.time));
  return (found.find((item) => item.playing) || found[0])?.time ?? null;
}

function openNotebookFor(textareaId) {
  const source = $(textareaId);
  const isDraft = textareaId === "entry-note";
  notebookSource = source;
  document.body.classList.add("notebook-open");
  notebook.open({
    value: source.value,
    title: $(isDraft ? "entry-title" : "edit-title").value.trim(),
    saveState: isDraft ? "idle" : "local",
    saveText: isDraft ? undefined : "Kept until you press Save",
    onInput(value) {
      source.value = value;
      source.dispatchEvent(new Event("input", { bubbles: true }));
    },
    onClose() {
      notebookSource = null;
      document.body.classList.remove("notebook-open");
      source.focus();
      source.setSelectionRange(source.value.length, source.value.length);
    },
    onPopOut: isDraft ? popOutNotebook : undefined,
    onSaveNow: isDraft ? () => saveDraftSoon.flush() : undefined,
    getVideoTime: activeTabId === null ? undefined : () => readVideoTime(activeTabId),
  });
}

async function popOutNotebook() {
  await flushPendingSaves();
  const source = activeTabId === null ? "" : `&tab=${activeTabId}`;
  // Opening the tab closes the popup; the draft is already saved.
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${NOTEBOOK_PAGE_PATH}${source}`) });
}

// The full-page notebook edits only the Add draft's note and keeps the other draft fields.
function initNotebookPage(addDraft) {
  document.body.classList.add("notebook-page");
  const sourceTabId = Number.parseInt(pageParams.get("tab") || "", 10);
  const titleOf = (draft) => draft?.title?.trim() || "";
  const showTitle = (draft) => {
    notebook.setTitle(titleOf(draft));
    document.title = titleOf(draft) ? `${titleOf(draft)} · Media Log notes` : "Media Log notes";
  };

  pageNoteSave = debounce((note) => queueDraftWrite(async () => {
    const { addDraft: latest } = await storage.get("addDraft");
    await storage.set({ addDraft: { ...Core.emptyDraft(), ...latest, note } });
  }).then(() => notebook.setSaveState("saved"), () => notebook.setSaveState("error")), SAVE_DELAY_MS);

  notebook.open({
    value: addDraft?.note || "",
    title: titleOf(addDraft),
    saveState: addDraft?.note ? "saved" : "idle",
    onInput(value) {
      notebook.setSaveState("saving");
      pageNoteSave(value);
    },
    onSaveNow: () => pageNoteSave.flush(),
    getVideoTime: Number.isInteger(sourceTabId) ? () => readVideoTime(sourceTabId) : undefined,
  });
  showTitle(addDraft);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("addDraft" in changes)) return;
    const next = changes.addDraft.newValue;
    if (!next) {
      // The popup added the entry with this note. Start fresh instead of re-saving it.
      pageNoteSave.cancel();
      notebook.setValue("");
      showTitle(null);
      notebook.setSaveState("saved", "Added to your log");
      return;
    }
    showTitle(next);
    // Take edits made in the popup, but never overwrite this page while you type here.
    if (!document.hasFocus() && typeof next.note === "string") notebook.setValue(next.note);
  });
}

// --- Init ---

function bindSettings(stored) {
  renderGreeting(stored.userName);
  const nameInput = $("user-name");
  nameInput.value = stored.userName || "";
  nameInput.addEventListener("input", () => {
    renderGreeting(nameInput.value);
    saveNameSoon(nameInput.value);
  });
  $("theme-select").addEventListener("change", (event) => storage.set({ theme: applyTheme(event.target.value) }));
  $("btn-export-backup").addEventListener("click", exportBackup);
  $("btn-import-backup").addEventListener("click", onImportClick);
  $("backup-file").addEventListener("change", importBackupFile);

  // Saves are debounced; write anything pending as the popup closes or the tab hides.
  addEventListener("blur", flushPendingSaves);
  addEventListener("pagehide", flushPendingSaves);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSaves();
  });
}

function bindPopup() {
  for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => openTab(tab.dataset.tab));
  $("btn-settings").addEventListener("click", () => switchTab("settings"));

  bindDraftFields();
  $("entry-form").addEventListener("submit", addEntry);
  for (const button of document.querySelectorAll("[data-notebook-for]")) {
    button.addEventListener("click", () => openNotebookFor(button.dataset.notebookFor));
  }

  $("week-entries").addEventListener("click", onWeekClick);
  $("edit-form").addEventListener("submit", saveEdit);
  $("edit-cancel").addEventListener("click", hideEditForm);
  $("btn-publish-week").addEventListener("click", publishCurrentWeek);
  $("btn-end-week").addEventListener("click", exportCurrentWeek);

  const historyList = $("history-list");
  $("history-search").addEventListener("input", () => renderHistorySoon());
  historyList.addEventListener("click", onHistoryClick);
  // toggle does not bubble, so listen in the capture phase.
  historyList.addEventListener("toggle", (event) => {
    if (event.target.classList?.contains("history-week") && event.target.open) fillHistoryWeek(event.target);
  }, true);

  $("toast").querySelector(".toast-action").addEventListener("click", () => {
    const action = toastAction;
    hideToast();
    action?.();
  });
}

async function init() {
  // Ask for the active tab while storage loads; the two don't depend on each other.
  const tabQuery = PAGE === "popup" ? chrome.tabs.query({ active: true, currentWindow: true }) : null;
  tabQuery?.catch(() => {});
  const stored = await storage.get(PORTABLE_KEYS);

  applyTheme(stored.theme);
  fillTypeMenus();
  bindSettings(stored);
  notebook = MediaLogNotebook.createNotebook($("notebook"));

  if (PAGE === "transfer") {
    document.body.classList.add("transfer-page");
    switchTab("settings");
    setStatus($("backup-status"), "Select Import Backup, then choose the full backup file.");
    return;
  }
  if (PAGE === "notebook") {
    initNotebookPage(stored.addDraft);
    return;
  }

  rolloverArchivedWeek = await loadState(stored);
  bindPopup();
  if (rolloverArchivedWeek) {
    switchTab("history");
    renderHistory();
  }
  const restoredDraft = restoreDraft(stored.addDraft);
  await prefillFromTab({ preserveDraftType: restoredDraft, tabQuery });
}

init();
