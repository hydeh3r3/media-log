import { readFile } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url).pathname;
const SENSITIVE_TITLE = "Sensitive Synthetic Migration Title";
const SENSITIVE_URL = "https://private.example.invalid/synthetic-migration";
const SENSITIVE_NOTE = "Synthetic private note that must stay out of reports.";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

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

function currentWeekShell() {
  const { week, year } = getISOWeek();
  const { start, end } = getWeekBounds(year, week);
  return {
    entries: [],
    weekEnd: formatDate(end),
    weekNumber: week,
    weekStart: formatDate(start),
    year,
  };
}

function syntheticLegacyStorage() {
  const currentWeek = currentWeekShell();
  currentWeek.entries = [
    {
      date: currentWeek.weekStart,
      note: SENSITIVE_NOTE,
      title: SENSITIVE_TITLE,
      type: "article",
      url: SENSITIVE_URL,
    },
  ];

  return {
    addDraft: {
      note: SENSITIVE_NOTE,
      title: SENSITIVE_TITLE,
      type: "article",
      url: SENSITIVE_URL,
    },
    currentWeek,
    history: [
      {
        entries: [
          {
            date: "2026-05-12",
            id: "legacy-history-entry",
            title: SENSITIVE_TITLE,
            type: "book",
            url: SENSITIVE_URL,
          },
        ],
        weekEnd: "2026-05-17",
        weekNumber: 20,
        weekStart: "2026-05-11",
        year: 2026,
      },
    ],
    syncState: {
      clientId: "migration-smoke-client",
    },
    syncTombstones: {
      deletedSyntheticEntry: "2026-05-20T00:00:00.000Z",
    },
  };
}

function createElementStub(id = "") {
  return {
    addEventListener() {},
    append() {},
    appendChild() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    className: "",
    dataset: {},
    hidden: false,
    id,
    prepend() {},
    remove() {},
    replaceChildren() {},
    style: {},
    textContent: "",
    value: "",
  };
}

function createDocumentStub() {
  const elements = new Map();
  return {
    createElement: (tagName) => createElementStub(tagName),
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElementStub(id));
      }
      return elements.get(id);
    },
    querySelector: () => createElementStub("query"),
    querySelectorAll: () => [],
  };
}

function createExtensionApi(storage) {
  return {
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
    storage: {
      local: {
        async get(keys) {
          if (!keys) return clone(storage);
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, clone(storage[key])]));
          }
          if (typeof keys === "string") {
            return { [keys]: clone(storage[keys]) };
          }
          return clone(storage);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storage[key];
          }
        },
        async set(patch) {
          Object.assign(storage, clone(patch));
        },
      },
    },
    tabs: {
      create: async () => undefined,
      query: async () => [],
    },
  };
}

async function loadPopupMigration(sourcePath, apiName) {
  const source = await readFile(sourcePath, "utf8");
  const sourceWithoutInit = source.replace(/\ninit\(\);\s*$/, "\n");
  const factory = new Function(`
    ${sourceWithoutInit}
    return {
      formatMigrationReport,
      getStorage,
      getSyncAuth,
      prepareLocalDataForSync,
      signOutOfSupabase,
      tagLegacySyncSession,
    };
  `);

  const storage = syntheticLegacyStorage();
  const api = createExtensionApi(storage);
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;
  const previousBrowser = globalThis.browser;

  globalThis.document = createDocumentStub();
  globalThis[apiName] = api;

  return {
    api: factory(),
    cleanup() {
      globalThis.document = previousDocument;
      globalThis.chrome = previousChrome;
      globalThis.browser = previousBrowser;
    },
    storage,
  };
}

function assertReportIsCountOnly(reportText) {
  assert(reportText.includes("Prepared local data."), "Migration report should explain that data was prepared.");
  assert(reportText.includes("Entries: 2."), "Migration report should show total entry count.");
  assert(reportText.includes("Archived weeks: 1."), "Migration report should show archived week count.");
  assert(reportText.includes("Tombstones: 1."), "Migration report should show tombstone count.");
  assert(!reportText.includes(SENSITIVE_TITLE), "Migration report must not include entry titles.");
  assert(!reportText.includes(SENSITIVE_URL), "Migration report must not include URLs.");
  assert(!reportText.includes(SENSITIVE_NOTE), "Migration report must not include notes.");
}

async function runPopupMigrationSmokeTest(label, sourcePath, apiName) {
  const { api, cleanup } = await loadPopupMigration(sourcePath, apiName);
  try {
    const report = await api.prepareLocalDataForSync();
    const reportText = api.formatMigrationReport(report);
    const data = await api.getStorage();
    const allEntries = [
      ...(data.currentWeek?.entries || []),
      ...(data.history || []).flatMap((week) => week.entries || []),
    ];

    assert(report.before.entriesNeedingMetadata === 2, `${label} should detect two legacy entries.`);
    assert(report.after.entriesNeedingMetadata === 0, `${label} should prepare all legacy entries.`);
    assert(data.addDraft?.updatedAt, `${label} should timestamp the saved draft.`);
    assert(data.syncState?.dirtyReason === "migration", `${label} should mark sync dirty for migration.`);
    assert(data.syncState?.dirtyAt, `${label} should save migration dirty time.`);
    assert(
      allEntries.every((entry) => entry.id && entry.createdAt && entry.updatedAt),
      `${label} should add entry metadata.`,
    );
    assertReportIsCountOnly(reportText);
  } finally {
    cleanup();
  }
}

async function runSessionBindingSmokeTest(sourcePath, apiName) {
  const { api, cleanup, storage } = await loadPopupMigration(sourcePath, apiName);
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ authorization: options.headers?.Authorization || "", url: String(url) });
    return new Response("{}");
  };
  const projectA = "https://project-a.supabase.co";
  const projectB = "https://project-b.supabase.co";
  const config = (supabaseUrl) => ({ mode: "supabase", supabaseAnonKey: "synthetic-publishable-key", supabaseUrl });
  const session = {
    accessToken: "synthetic-access-token",
    expiresAt: Date.now() + 3_600_000,
    refreshToken: "synthetic-refresh-token",
    supabaseUrl: projectA,
    userEmail: "",
  };

  try {
    const auth = await api.getSyncAuth(config(projectA), session);
    assert(auth.token === session.accessToken && auth.endpoint.startsWith(projectA), "A session should work with its own project.");

    const otherProject = await api.getSyncAuth(config(projectB), session).then(() => "used", () => "rejected");
    assert(otherProject === "rejected", "A session must not be used with another Supabase project.");
    assert(storage.syncSession === null, "A session for another project should be cleared.");

    await api.signOutOfSupabase(config(projectB), session);
    assert(requests.length === 0, "Signing out must not send the token to another project.");
    await api.signOutOfSupabase(config(projectA), session);
    assert(requests.length === 1 && requests[0].url.startsWith(projectA), "Signing out should reach the issuing project.");

    const { supabaseUrl: _unused, ...legacySession } = session;
    storage.syncConfig = config(projectA);
    storage.syncSession = legacySession;
    await api.tagLegacySyncSession();
    assert(storage.syncSession.supabaseUrl === projectA, "Older saved sessions should belong to the saved project.");
  } finally {
    globalThis.fetch = previousFetch;
    cleanup();
  }
}

await runPopupMigrationSmokeTest("Chrome", `${ROOT}/chrome-stable/popup.js`, "chrome");
await runSessionBindingSmokeTest(`${ROOT}/chrome-stable/popup.js`, "chrome");

console.log("Chrome Stable migration smoke test passed with count-only reports and project-bound sessions.");
