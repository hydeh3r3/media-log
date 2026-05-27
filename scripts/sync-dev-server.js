import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DATA_PATH = process.env.MEDIA_LOG_SYNC_DATA_PATH || join(ROOT, ".local-sync", "media-log-sync.json");
const HOST = process.env.MEDIA_LOG_SYNC_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.MEDIA_LOG_SYNC_PORT || "43189", 10);
const DEV_TOKEN = process.env.MEDIA_LOG_SYNC_TOKEN || "dev-media-log-token";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

async function readStore() {
  try {
    return await Bun.file(DATA_PATH).json();
  } catch {
    return { users: {} };
  }
}

async function writeStore(store) {
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await Bun.write(DATA_PATH, JSON.stringify(store, null, 2));
}

function assertAuth(request) {
  const header = request.headers.get("authorization") || "";
  if (header !== `Bearer ${DEV_TOKEN}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  return null;
}

function emptyRecord(userId) {
  return {
    userId,
    revision: 0,
    updatedAt: null,
    data: {
      currentWeek: null,
      history: [],
      addDraft: null,
      tombstones: {},
    },
  };
}

function getUserId(url, body) {
  return body?.userId || url.searchParams.get("userId") || "personal";
}

function timestampValue(value) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestTimestamp(a, b) {
  return timestampValue(a) >= timestampValue(b) ? a : b || a;
}

function weekKey(week) {
  return `${week.year}-W${String(week.weekNumber).padStart(2, "0")}`;
}

function normalizeSnapshot(snapshot = {}) {
  return {
    currentWeek: snapshot.currentWeek || null,
    history: Array.isArray(snapshot.history) ? snapshot.history : [],
    addDraft: snapshot.addDraft || null,
    tombstones: snapshot.tombstones || {},
  };
}

function mergeTombstones(localTombstones = {}, remoteTombstones = {}) {
  const tombstones = { ...remoteTombstones };
  for (const [entryId, deletedAt] of Object.entries(localTombstones)) {
    tombstones[entryId] = newestTimestamp(deletedAt, tombstones[entryId]);
  }
  return tombstones;
}

function mergeDraft(localDraft, remoteDraft) {
  if (!localDraft) return remoteDraft || null;
  if (!remoteDraft) return localDraft;
  return timestampValue(localDraft.updatedAt) >= timestampValue(remoteDraft.updatedAt) ? localDraft : remoteDraft;
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

function mergeEntries(entries, tombstones) {
  const byId = new Map();
  for (const entry of entries) {
    const existing = byId.get(entry.id);
    if (!existing || timestampValue(entry.updatedAt) >= timestampValue(existing.updatedAt)) {
      byId.set(entry.id, entry);
    }
  }

  return [...byId.values()]
    .filter((entry) => {
      const deletedAt = tombstones[entry.id];
      return !deletedAt || timestampValue(deletedAt) < timestampValue(entry.updatedAt);
    })
    .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt));
}

function mergeSnapshots(localSnapshot, remoteSnapshot) {
  const local = normalizeSnapshot(localSnapshot);
  const remote = normalizeSnapshot(remoteSnapshot);
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const weeks = new Map();

  addWeekToMap(weeks, remote.currentWeek);
  for (const week of remote.history) addWeekToMap(weeks, week);
  addWeekToMap(weeks, local.currentWeek);
  for (const week of local.history) addWeekToMap(weeks, week);

  for (const week of weeks.values()) {
    week.entries = mergeEntries(week.entries || [], tombstones);
  }

  const currentKey = local.currentWeek
    ? weekKey(local.currentWeek)
    : remote.currentWeek
      ? weekKey(remote.currentWeek)
      : null;
  const currentWeek = currentKey ? weeks.get(currentKey) || null : null;
  const history = [...weeks.entries()]
    .filter(([key]) => key !== currentKey)
    .map(([, week]) => week)
    .sort((a, b) => b.year - a.year || b.weekNumber - a.weekNumber);

  return {
    currentWeek,
    history,
    addDraft: mergeDraft(local.addDraft, remote.addDraft),
    tombstones,
  };
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "media-log-sync-dev" });
    }

    if (url.pathname !== "/v1/media-log") {
      return jsonResponse({ ok: false, error: "Not found" }, 404);
    }

    const authError = assertAuth(request);
    if (authError) {
      return authError;
    }

    const store = await readStore();

    if (request.method === "GET") {
      const userId = getUserId(url);
      return jsonResponse({ ok: true, record: store.users[userId] || emptyRecord(userId) });
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const userId = getUserId(url, body);
      const previous = store.users[userId] || emptyRecord(userId);
      const nextRevision = previous.revision + 1;
      const record = {
        userId,
        revision: nextRevision,
        updatedAt: new Date().toISOString(),
        clientId: body.clientId || null,
        data: mergeSnapshots(body.data, previous.data),
      };

      store.users[userId] = record;
      await writeStore(store);
      return jsonResponse({ ok: true, record });
    }

    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  },
});

console.log(`Media Log dev sync server listening on http://${HOST}:${PORT}`);
console.log(`Data file: ${DATA_PATH}`);
console.log(`Bearer token: ${DEV_TOKEN}`);
