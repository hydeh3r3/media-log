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
    },
  };
}

function getUserId(url, body) {
  return body?.userId || url.searchParams.get("userId") || "personal";
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
        data: body.data,
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
