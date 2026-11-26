import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// core.js has no DOM or chrome dependencies, so the real validator loads directly.
async function loadBackupValidator(sourcePath) {
  const source = await readFile(sourcePath, "utf8");
  return new Function("globalThis", `${source}\nreturn globalThis.MediaLogCore;`)({});
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

const chromeValidator = await loadBackupValidator(join(ROOT, "chrome-nightly/core.js"));
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

  // Long notebook notes survive a backup round trip; absurdly long ones are still refused.
  const longNote = structuredClone(syntheticBackup());
  longNote.data.history[0].entries[0].note = "word ".repeat(18_000);
  longNote.data.addDraft = { url: "", title: "", type: "article", date: "", rating: "", note: "draft ".repeat(15_000) };
  const longData = validator.validateBackup(longNote);
  assert.equal(longData.history[0].entries[0].note.length, 90_000, `${label} should keep a 90,000 character note.`);
  // Set-aside entries travel with the backup, and draft links that are not web links are dropped
  // on export so they can't block the import.
  const withParked = validator.createBackup({
    ...syntheticBackup().data,
    addDraft: { url: "chrome-extension://abc/popup.html?notebook=1", title: "", type: "article", date: "", rating: "", note: "loose" },
    parkedDrafts: [{ url: "https://example.com/a", title: "A", type: "film", date: "2026-08-05", rating: "", note: "aside" }],
  }, new Date("2026-08-06T00:00:00Z"));
  assert.equal(withParked.data.addDraft.url, "", `${label} should drop a non-web draft link on export.`);
  const parkedData = validator.validateBackup(JSON.parse(JSON.stringify(withParked)));
  assert.deepEqual(parkedData.parkedDrafts.map((draft) => draft.note), ["aside"], `${label} should keep set-aside entries.`);
  assert.equal(validator.validateBackup(syntheticBackup()).parkedDrafts, undefined, `${label} should accept backups without set-aside entries.`);
  const badParked = structuredClone(syntheticBackup());
  badParked.data.parkedDrafts = { not: "a list" };
  assert.throws(() => validator.validateBackup(badParked), /must be a list/, `${label} should reject a malformed set-aside list.`);

  const tooLong = structuredClone(syntheticBackup());
  tooLong.data.history[0].entries[0].note = "x".repeat(100_001);
  assert.throws(() => validator.validateBackup(tooLong), /too long/, `${label} should reject notes over the limit.`);
}

console.log(`Nightly backup checks passed: ${expectedEntryCount} entries preserved; truncated data and unsafe URLs rejected.`);
