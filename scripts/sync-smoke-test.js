import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const ROOT = new URL("..", import.meta.url).pathname;
const DEV_TOKEN = "dev-media-log-token";
const USER_ID = "sync-smoke-user";
const SAFE_ENTRY_TITLE = "Safe Sync Smoke Test";
const SAFE_OFFLINE_A_TITLE = "Safe Offline Client A";
const SAFE_OFFLINE_B_TITLE = "Safe Offline Client B";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error("Could not allocate a local sync smoke test port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl, server) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const state = await Promise.race([
      server.exited.then((exitCode) => ({ exitCode, exited: true })),
      sleep(100).then(() => ({ exited: false })),
    ]);

    if (state.exited) {
      throw new Error(`Dev sync server exited early with code ${state.exitCode}.`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the server is ready or the deadline expires.
    }
  }

  throw new Error("Dev sync server did not become ready.");
}

async function stopServer(server) {
  server.kill("SIGTERM");
  const state = await Promise.race([
    server.exited.then(() => ({ exited: true })),
    sleep(1000).then(() => ({ exited: false })),
  ]);

  if (!state.exited) {
    server.kill("SIGKILL");
    await server.exited;
  }
}

function smokeSnapshot() {
  return {
    currentWeek: {
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      weekNumber: 22,
      year: 2026,
      entries: [
        {
          id: "safe-sync-entry",
          type: "article",
          title: SAFE_ENTRY_TITLE,
          date: "2026-05-26",
          createdAt: "2026-05-26T00:00:00.000Z",
          updatedAt: "2026-05-26T00:00:00.000Z",
          url: "https://example.com/media-log-sync-smoke-test",
          note: "Synthetic verification data only.",
        },
      ],
    },
    history: [],
    addDraft: null,
    tombstones: {},
  };
}

function offlineSnapshot(entry) {
  return {
    currentWeek: {
      weekStart: "2026-06-01",
      weekEnd: "2026-06-07",
      weekNumber: 23,
      year: 2026,
      entries: [entry],
    },
    history: [],
    addDraft: null,
    tombstones: {},
  };
}

function safeEntry(id, title, createdAt) {
  return {
    id,
    type: "article",
    title,
    date: "2026-06-02",
    createdAt,
    updatedAt: createdAt,
    url: `https://example.com/${id}`,
    note: "Synthetic offline merge verification data only.",
  };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { body, response };
}

async function runSmokeTest() {
  const port = await getOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDir = await mkdtemp(join(tmpdir(), "media-log-sync-smoke-"));
  const dataPath = join(tempDir, "media-log-sync.json");
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));
  const server = Bun.spawn(["bun", "run", "scripts/sync-dev-server.js"], {
    cwd: ROOT,
    env: {
      ...env,
      MEDIA_LOG_SYNC_DATA_PATH: dataPath,
      MEDIA_LOG_SYNC_PORT: String(port),
    },
    stderr: "inherit",
    stdout: "inherit",
  });

  try {
    await waitForHealth(baseUrl, server);

    const unauthorized = await fetch(`${baseUrl}/v1/media-log?userId=${USER_ID}`);
    assert(unauthorized.status === 401, "Dev sync server should reject missing bearer tokens.");

    const headers = {
      authorization: `Bearer ${DEV_TOKEN}`,
      "content-type": "application/json",
    };
    const payload = {
      userId: USER_ID,
      clientId: "sync-smoke-client",
      data: smokeSnapshot(),
    };

    const put = await jsonFetch(`${baseUrl}/v1/media-log`, {
      body: JSON.stringify(payload),
      headers,
      method: "PUT",
    });
    assert(put.response.ok, `Sync smoke PUT failed with ${put.response.status}.`);
    assert(put.body.record?.revision === 1, "Sync smoke PUT did not create revision 1.");

    const get = await jsonFetch(`${baseUrl}/v1/media-log?userId=${USER_ID}`, { headers });
    assert(get.response.ok, `Sync smoke GET failed with ${get.response.status}.`);
    assert(get.body.record?.data?.currentWeek?.entries?.length === 1, "Sync smoke GET did not return one entry.");
    assert(
      get.body.record.data.currentWeek.entries[0].title === SAFE_ENTRY_TITLE,
      "Sync smoke GET returned unexpected entry data.",
    );

    const offlineUserId = `${USER_ID}-offline`;
    const clientA = safeEntry("safe-offline-client-a", SAFE_OFFLINE_A_TITLE, "2026-06-02T00:00:00.000Z");
    const clientB = safeEntry("safe-offline-client-b", SAFE_OFFLINE_B_TITLE, "2026-06-02T00:01:00.000Z");

    const offlinePutA = await jsonFetch(`${baseUrl}/v1/media-log`, {
      body: JSON.stringify({
        userId: offlineUserId,
        clientId: "sync-smoke-offline-client-a",
        data: offlineSnapshot(clientA),
      }),
      headers,
      method: "PUT",
    });
    assert(offlinePutA.response.ok, `Offline client A PUT failed with ${offlinePutA.response.status}.`);

    const offlinePutB = await jsonFetch(`${baseUrl}/v1/media-log`, {
      body: JSON.stringify({
        userId: offlineUserId,
        clientId: "sync-smoke-offline-client-b",
        data: offlineSnapshot(clientB),
      }),
      headers,
      method: "PUT",
    });
    assert(offlinePutB.response.ok, `Offline client B PUT failed with ${offlinePutB.response.status}.`);
    assert(offlinePutB.body.record?.revision === 2, "Offline merge did not create revision 2.");

    const offlineEntries = offlinePutB.body.record?.data?.currentWeek?.entries || [];
    const offlineTitles = offlineEntries.map((entry) => entry.title).sort();
    assert(offlineEntries.length === 2, "Offline merge should preserve both client entries.");
    assert(
      offlineTitles.join("|") === [SAFE_OFFLINE_A_TITLE, SAFE_OFFLINE_B_TITLE].sort().join("|"),
      "Offline merge returned unexpected entry titles.",
    );

    console.log("Local sync smoke test passed with safe single-entry and offline merge checks.");
  } finally {
    await stopServer(server);
    await rm(tempDir, { force: true, recursive: true });
  }
}

await runSmokeTest();
