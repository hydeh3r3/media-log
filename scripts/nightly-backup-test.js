import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function createElementStub() {
  return {
    addEventListener() {},
    after() {},
    appendChild() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    click() {},
    dataset: {},
    files: [],
    style: {},
    value: "",
  };
}

function createDocumentStub() {
  const elements = new Map();
  return {
    createElement: () => createElementStub(),
    documentElement: { dataset: {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElementStub());
      return elements.get(id);
    },
    querySelector: () => createElementStub(),
    querySelectorAll: () => [],
  };
}

async function loadBackupValidator(sourcePath, apiName) {
  const source = await readFile(sourcePath, "utf8");
  const sourceWithoutInit = source.replace(/\ninit\(\);\s*$/, "\n");
  const factory = new Function(`${sourceWithoutInit}\nreturn { countBackupEntries, validateBackup, verifyPortableStorage };`);
  const previousApi = globalThis[apiName];
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;

  globalThis.document = createDocumentStub();
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
  };
  globalThis[apiName] = {
    storage: {
      local: {
        get: async () => ({}),
        remove: async () => undefined,
        set: async () => undefined,
      },
    },
    tabs: { query: async () => [] },
  };

  try {
    return factory();
  } finally {
    globalThis[apiName] = previousApi;
    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
  }
}

function syntheticBackup() {
  return {
    format: "media-log-backup",
    version: 1,
    exportedAt: "2026-08-06T00:00:00.000Z",
    data: {
      currentWeek: {
        entries: [
          {
            createdAt: "2026-08-06T00:00:00.000Z",
            date: "2026-08-06",
            title: "Current entry",
            type: "article",
            url: "https://example.com/current",
          },
        ],
        weekEnd: "2026-08-09",
        weekNumber: 32,
        weekStart: "2026-08-03",
        year: 2026,
      },
      history: [
        {
          entries: [
            {
              date: "2026-07-30",
              note: "Archived note",
              rating: 9,
              title: "Archived entry",
              type: "book",
            },
          ],
          weekEnd: "2026-08-02",
          weekNumber: 31,
          weekStart: "2026-07-27",
          year: 2026,
        },
      ],
      theme: "monet",
      userName: "Ali",
    },
  };
}

const chromeValidator = await loadBackupValidator(join(ROOT, "chrome-nightly/popup.js"), "chrome");
const backup = process.env.MEDIA_LOG_BACKUP_PATH
  ? JSON.parse(await readFile(process.env.MEDIA_LOG_BACKUP_PATH, "utf8"))
  : syntheticBackup();
const expectedEntryCount = (backup.data.currentWeek?.entries?.length || 0)
  + backup.data.history.reduce((total, week) => total + (week.entries?.length || 0), 0);

for (const [label, validator] of [["Nightly", chromeValidator]]) {
  const data = validator.validateBackup(backup);
  assert.equal(validator.countBackupEntries(data), expectedEntryCount, `${label} should preserve every backup entry.`);
  assert.deepEqual(validator.verifyPortableStorage(data, structuredClone(data)), data, `${label} should accept an exact storage read-back.`);

  const truncatedData = structuredClone(data);
  truncatedData.history = [];
  assert.throws(
    () => validator.verifyPortableStorage(data, truncatedData),
    /Import verification failed/,
    `${label} should reject a read-back that lost archived weeks.`,
  );

  const unsafeBackup = structuredClone(syntheticBackup());
  unsafeBackup.data.currentWeek.entries[0].url = "javascript:alert(1)";
  assert.throws(() => validator.validateBackup(unsafeBackup), /HTTP or HTTPS/, `${label} should reject unsafe URL schemes.`);
}

console.log(`Nightly backup checks passed: ${expectedEntryCount} entries preserved; truncated data and unsafe URLs rejected.`);
