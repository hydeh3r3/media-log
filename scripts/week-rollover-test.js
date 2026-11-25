import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../chrome-nightly/core.js", import.meta.url), "utf8");
const core = new Function("globalThis", `${source}\nreturn globalThis.MediaLogCore;`)({});

const week47 = () => core.createWeek(2026, 47); // 16-22 November 2026
const entry = (title, createdAt) => ({ type: "anime", title, date: "2026-11-18", createdAt });
const monday48 = new Date(2026, 10, 23, 9, 0); // Local Monday of Week 48

// A week with entries moves into history on Monday; the new week starts empty.
{
  const state = { currentWeek: { ...week47(), entries: [entry("A", "2026-11-18T10:00:00.000Z")] }, history: [] };
  const { changed, archivedWeek } = core.rollWeek(state, monday48);
  assert.equal(changed, true);
  assert.equal(archivedWeek.weekNumber, 47);
  assert.deepEqual(state.history.map((week) => week.weekNumber), [47]);
  assert.equal(state.currentWeek.weekNumber, 48);
  assert.equal(state.currentWeek.entries.length, 0);
}

// An empty week is dropped instead of archived.
{
  const state = { currentWeek: week47(), history: [] };
  const { changed, archivedWeek } = core.rollWeek(state, monday48);
  assert.equal(changed, true);
  assert.equal(archivedWeek, null);
  assert.equal(state.history.length, 0);
}

// Within the same ISO week nothing changes.
{
  const state = { currentWeek: week47(), history: [] };
  assert.equal(core.rollWeek(state, new Date(2026, 10, 22, 23, 30)).changed, false);
}

// A week already in history (split by the retired Start New Week button) absorbs the
// rest of its entries, so publishing never sees two copies of Week 47.
{
  const earlier = { ...week47(), entries: [entry("A", "2026-11-17T10:00:00.000Z"), entry("C", "2026-11-19T10:00:00.000Z")] };
  const older = { ...core.createWeek(2026, 46), entries: [entry("Old", "2026-11-10T10:00:00.000Z")] };
  const state = { currentWeek: { ...week47(), entries: [entry("B", "2026-11-18T10:00:00.000Z")] }, history: [earlier, older] };
  const { archivedWeek } = core.rollWeek(state, monday48);
  assert.equal(state.history.length, 2, "No duplicate Week 47");
  assert.equal(archivedWeek, earlier, "The existing record is the archived week");
  assert.deepEqual(state.history[0].entries.map((item) => item.title), ["A", "B", "C"], "Entries merge in creation order");
  assert.deepEqual(state.history.map((week) => week.weekNumber), [47, 46]);
}

assert.equal("startNewWeek" in core, false, "Start New Week is retired");

console.log("Week rollover checks passed: archive, empty-week drop, same-week no-op, and no duplicate weeks.");
