const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, unknown>;

type Env = {
  publishableKey: string;
  secretKey: string;
  supabaseUrl: string;
};

type MediaEntry = JsonObject & {
  id: string;
  type: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

type MediaWeek = JsonObject & {
  weekNumber: number;
  year: number;
  weekStart?: string;
  weekEnd?: string;
  entries: MediaEntry[];
};

type MediaLogSnapshot = {
  currentWeek: MediaWeek | null;
  history: MediaWeek[];
  addDraft: JsonObject | null;
  tombstones: Record<string, string>;
};

type SyncRecord = {
  userId: string;
  revision: number;
  updatedAt: string | null;
  data: MediaLogSnapshot;
};

type PushBody = {
  clientId?: unknown;
  data?: unknown;
};

type SupabaseUser = {
  id: string;
};

type SupabaseRecordRow = {
  user_id: string;
  revision?: number | string | null;
  updated_at?: string | null;
  data?: unknown;
};

type SyncEntitlementRow = {
  status?: string | null;
  expires_at?: string | null;
  price_cents?: number | string | null;
  currency?: string | null;
};

class HttpResponseError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: CORS_HEADERS,
  });
}

function httpError(status: number, message: string): HttpResponseError {
  return new HttpResponseError(status, message);
}

function readJsonSecret(name: string): unknown {
  const value = Deno.env.get(name);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstSecretValue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const values = value as Record<string, unknown>;
  if (typeof values.default === "string") return values.default;
  return Object.values(values).find((item): item is string => typeof item === "string") || null;
}

function readEnv(): Env {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    firstSecretValue(readJsonSecret("SUPABASE_PUBLISHABLE_KEYS")) || Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey =
    firstSecretValue(readJsonSecret("SUPABASE_SECRET_KEYS")) || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw httpError(500, "Supabase sync is not configured.");
  }

  return { publishableKey, secretKey, supabaseUrl: supabaseUrl.replace(/\/$/, "") };
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timestampValue(value: unknown): number {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function weekKey(week: Pick<MediaWeek, "weekNumber" | "year">): string {
  return `${week.year}-W${String(week.weekNumber).padStart(2, "0")}`;
}

function sanitizeEntry(entry: unknown): MediaEntry {
  if (!isObject(entry)) {
    throw httpError(400, "Each entry must be an object.");
  }

  for (const field of ["id", "type", "title", "date", "createdAt", "updatedAt"]) {
    if (typeof entry[field] !== "string" || !entry[field]) {
      throw httpError(400, `Entry field ${field} is required.`);
    }
  }

  return entry as MediaEntry;
}

function sanitizeWeek(week: unknown): MediaWeek | null {
  if (week === null || week === undefined) return null;
  if (!isObject(week)) {
    throw httpError(400, "Each week must be an object.");
  }
  if (!Number.isInteger(week.weekNumber) || !Number.isInteger(week.year)) {
    throw httpError(400, "Week number and year are required.");
  }

  return {
    ...week,
    entries: Array.isArray(week.entries) ? week.entries.map(sanitizeEntry) : [],
  } as MediaWeek;
}

function sanitizeTombstones(tombstones: unknown): Record<string, string> {
  if (!tombstones) return {};
  if (!isObject(tombstones)) {
    throw httpError(400, "Tombstones must be an object.");
  }

  return Object.fromEntries(
    Object.entries(tombstones).filter(
      ([entryId, deletedAt]) => typeof entryId === "string" && typeof deletedAt === "string",
    ),
  );
}

function sanitizeSnapshot(data: unknown): MediaLogSnapshot {
  if (!isObject(data)) {
    throw httpError(400, "Sync data must be an object.");
  }

  return {
    currentWeek: sanitizeWeek(data.currentWeek),
    history: Array.isArray(data.history)
      ? data.history.map(sanitizeWeek).filter((week): week is MediaWeek => Boolean(week))
      : [],
    addDraft: data.addDraft && isObject(data.addDraft) ? { ...data.addDraft } : null,
    tombstones: sanitizeTombstones(data.tombstones),
  };
}

function emptyRecord(userId: string): SyncRecord {
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

function newestTimestamp(a: string, b?: string): string {
  return timestampValue(a) >= timestampValue(b) ? a : b || a;
}

function mergeTombstones(
  localTombstones: Record<string, string> = {},
  remoteTombstones: Record<string, string> = {},
): Record<string, string> {
  const tombstones = { ...remoteTombstones };
  for (const [entryId, deletedAt] of Object.entries(localTombstones)) {
    tombstones[entryId] = newestTimestamp(deletedAt, tombstones[entryId]);
  }
  return tombstones;
}

function mergeDraft(localDraft: JsonObject | null, remoteDraft: JsonObject | null): JsonObject | null {
  if (!localDraft) return remoteDraft || null;
  if (!remoteDraft) return localDraft;
  return timestampValue(localDraft.updatedAt) >= timestampValue(remoteDraft.updatedAt) ? localDraft : remoteDraft;
}

function addWeekToMap(map: Map<string, MediaWeek>, week: MediaWeek | null): void {
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

function mergeEntries(entries: MediaEntry[], tombstones: Record<string, string>): MediaEntry[] {
  const byId = new Map<string, MediaEntry>();
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

function mergeSnapshots(localSnapshot: MediaLogSnapshot, remoteSnapshot: MediaLogSnapshot | null): MediaLogSnapshot {
  if (!remoteSnapshot) return localSnapshot;

  const tombstones = mergeTombstones(localSnapshot.tombstones, remoteSnapshot.tombstones);
  const weeks = new Map<string, MediaWeek>();

  addWeekToMap(weeks, remoteSnapshot.currentWeek);
  for (const week of remoteSnapshot.history || []) addWeekToMap(weeks, week);
  addWeekToMap(weeks, localSnapshot.currentWeek);
  for (const week of localSnapshot.history || []) addWeekToMap(weeks, week);

  for (const week of weeks.values()) {
    week.entries = mergeEntries(week.entries || [], tombstones);
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

async function readUser(env: Env, authorization: string | null): Promise<SupabaseUser> {
  if (!authorization?.startsWith("Bearer ")) {
    throw httpError(401, "Missing bearer token.");
  }

  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.publishableKey,
      authorization,
    },
  });

  if (!response.ok) {
    throw httpError(401, "Invalid bearer token.");
  }

  const user = await response.json() as SupabaseUser;
  if (!user?.id) {
    throw httpError(401, "Invalid bearer token.");
  }

  return user;
}

async function supabaseFetch(env: Env, path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", env.secretKey);
  headers.set("Authorization", `Bearer ${env.secretKey}`);

  const response = await fetch(`${env.supabaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase REST error", response.status, detail);
    throw httpError(502, "Database request failed.");
  }

  return response;
}

async function readRecord(env: Env, userId: string): Promise<SyncRecord> {
  const path = `/rest/v1/media_log_records?user_id=eq.${encodeURIComponent(userId)}&select=user_id,revision,updated_at,data&limit=1`;
  const response = await supabaseFetch(env, path);
  const rows = await response.json() as SupabaseRecordRow[];
  const row = rows[0];

  if (!row) {
    return emptyRecord(userId);
  }

  return {
    userId: row.user_id,
    revision: Number(row.revision || 0),
    updatedAt: row.updated_at,
    data: sanitizeSnapshot(row.data || {}),
  };
}

function hasActiveSyncEntitlement(row: SyncEntitlementRow | null): boolean {
  if (!row || row.status !== "active") {
    return false;
  }

  const priceCents = Number(row.price_cents || 0);
  if (priceCents !== 200 || row.currency !== "usd") {
    return false;
  }

  return !row.expires_at || timestampValue(row.expires_at) > Date.now();
}

async function readSyncEntitlement(env: Env, userId: string): Promise<SyncEntitlementRow | null> {
  const path = `/rest/v1/media_log_sync_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=status,expires_at,price_cents,currency&limit=1`;
  const response = await supabaseFetch(env, path);
  const rows = await response.json() as SyncEntitlementRow[];
  return rows[0] || null;
}

async function assertSyncEntitlement(env: Env, userId: string): Promise<void> {
  const entitlement = await readSyncEntitlement(env, userId);
  if (!hasActiveSyncEntitlement(entitlement)) {
    throw httpError(402, "Cross-device sync requires the $2 sync unlock.");
  }
}

async function writeRecord(env: Env, userId: string, previousRecord: SyncRecord, body: PushBody): Promise<SyncRecord> {
  const incomingSnapshot = sanitizeSnapshot(body.data);
  const mergedSnapshot = mergeSnapshots(incomingSnapshot, previousRecord.data);
  const nextRevision = previousRecord.revision + 1;
  const payload = [
    {
      user_id: userId,
      revision: nextRevision,
      data: mergedSnapshot,
      client_id: typeof body.clientId === "string" ? body.clientId : null,
    },
  ];

  const response = await supabaseFetch(env, "/rest/v1/media_log_records?on_conflict=user_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const rows = await response.json() as SupabaseRecordRow[];
  const row = rows[0];

  if (!row) {
    throw httpError(502, "Database write returned no row.");
  }

  return {
    userId: row.user_id,
    revision: Number(row.revision || nextRevision),
    updatedAt: row.updated_at,
    data: sanitizeSnapshot(row.data || mergedSnapshot),
  };
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (!["GET", "PUT"].includes(request.method)) {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const env = readEnv();
  const user = await readUser(env, request.headers.get("authorization"));
  await assertSyncEntitlement(env, user.id);
  const previousRecord = await readRecord(env, user.id);

  if (request.method === "GET") {
    return jsonResponse({ ok: true, record: previousRecord });
  }

  const body = await request.json() as PushBody;
  const record = await writeRecord(env, user.id, previousRecord, body);
  return jsonResponse({ ok: true, record });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    const status = error instanceof HttpResponseError ? error.status : 500;
    const message = status === 500 ? "Internal server error." : error instanceof Error ? error.message : "Request failed.";
    if (status === 500) {
      console.error(error);
    }
    return jsonResponse({ ok: false, error: message }, status);
  }
});
