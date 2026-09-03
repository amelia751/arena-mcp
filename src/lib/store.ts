import "server-only";
import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import type { Environment, Match, StepRecord } from "./types";

export type DB = {
  environments: Record<string, Environment>;
  matches: Record<string, Match>;
  steps: Record<string, StepRecord[]>;
};

const FILE = path.join(process.cwd(), ".data", "store.json");
const SERVERLESS = !!(
  process.env.NETLIFY ||
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

let mem: DB | null = null;
let memMtime = 0;
let writeChain: Promise<void> = Promise.resolve();

/** Nothing ships with the page. Every game here was written by somebody. */
function empty(): DB {
  return { environments: {}, matches: {}, steps: {} };
}

function reconcile(db: DB): DB {
  db.environments = db.environments ?? {};
  db.matches = db.matches ?? {};
  db.steps = db.steps ?? {};
  for (const row of Object.values(db.environments)) row.kind = "authored";
  return db;
}

const BLOB_KEY = "db.json";
type WriteGuard = { onlyIfMatch?: string; onlyIfNew?: boolean };
type BlobStore = {
  get: (key: string) => Promise<string | null>;
  getWithMetadata: (
    key: string,
    options?: { type: "text" },
  ) => Promise<{ data: string | null; etag?: string } | null>;
  setJSON: (key: string, value: unknown, guard?: WriteGuard) => Promise<{ modified?: boolean }>;
};
let blobStore: BlobStore | null = null;

async function blobs(): Promise<BlobStore | null> {
  if (!SERVERLESS) return null;
  if (blobStore) return blobStore;
  try {
    const { getStore } = await import("@netlify/blobs");
    blobStore = getStore({ name: "arena", consistency: "strong" }) as BlobStore;
    return blobStore;
  } catch {
    // Do not cache a failed init — the next request may have the context.
    return null;
  }
}

let lastComplaint = 0;

/** Says why a read failed without touching the store that is already failing. */
function complain(err: unknown) {
  const now = Date.now();
  if (now - lastComplaint < 30_000) return;
  lastComplaint = now;
  console.error(`arena store read failed: ${err instanceof Error ? err.message : String(err)}`);
}

/**
 * The version tag comes back with the data so a write can prove it is building
 * on the copy it read. Null means the store did not answer, which is a
 * different thing from an empty store.
 */
async function readBlob(): Promise<{ db: DB; etag?: string } | null> {
  const store = await blobs();
  if (!store) return null;
  try {
    const row = await store.getWithMetadata(BLOB_KEY, { type: "text" });
    const raw = row?.data ?? null;
    return { db: reconcile(raw ? (JSON.parse(raw) as DB) : empty()), etag: row?.etag };
  } catch (err) {
    complain(err);
    return null;
  }
}

// Two open tabs poll this every couple of seconds and every poll used to be its
// own round trip. Holding the answer for a moment, and sharing one trip between
// callers who arrive together, is the difference between a busy store and a
// failing one.
const READ_TTL = 750;
let memAt = 0;
let inFlight: Promise<{ db: DB; etag?: string } | null> | null = null;

function freshRead() {
  if (!inFlight) {
    inFlight = readBlob().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function load(): Promise<DB> {
  if (SERVERLESS) {
    if (mem && Date.now() - memAt < READ_TTL) return mem;
    const snap = await freshRead();
    if (snap) {
      mem = snap.db;
      memAt = Date.now();
      return mem;
    }
    // Showing a slightly old page beats showing an error page.
    if (!mem) mem = empty();
    return mem;
  }
  let mtime = 0;
  try {
    mtime = (await stat(/*turbopackIgnore: true*/ FILE)).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (mem && mtime && mtime === memMtime) return mem;
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ FILE, "utf8");
    mem = reconcile(JSON.parse(raw) as DB);
    memMtime = mtime;
    return mem;
  } catch {
    mem = empty();
    await persist(mem);
    return mem;
  }
}

async function persist(db: DB) {
  mem = db;
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    await writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(db), "utf8");
    await rename(/*turbopackIgnore: true*/ tmp, FILE);
    memMtime = (await stat(/*turbopackIgnore: true*/ FILE)).mtimeMs;
  } catch {
    // Read-only hosts fall back to process memory.
  }
}

const UNREACHABLE = "the store is unreachable, so nothing was saved";
const BUSY = "the store is busy, so nothing was saved";

function pause(attempt: number) {
  // Spread the retries out so two writers racing do not collide again in step.
  const spread = 40 * (attempt + 1);
  return new Promise((r) => setTimeout(r, spread + Math.random() * spread));
}

/**
 * Save the edit only if nobody changed the store since we read it.
 *
 * Everything lives in one document, so a plain save writes the whole world back.
 * The page, the agent's tools and the bot all write at once, and without this
 * the last one to finish quietly erases whatever the others just did — a move
 * lands, then vanishes. The version tag turns that into a refusal we can retry.
 */
async function saveIfUnchanged(db: DB, etag?: string): Promise<boolean> {
  const store = await blobs();
  if (!store) throw new Error(UNREACHABLE);
  const guard: WriteGuard = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
  const done = await store.setJSON(BLOB_KEY, db, guard);
  return done?.modified !== false;
}

/**
 * Read, apply the edit, and save — redoing the whole thing if somebody got there
 * first. Re-running the edit against the newer copy is what keeps both changes.
 */
async function apply<T>(fn: (db: DB) => T): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const snap = await readBlob();
    // A write built on a copy we could not read would put an old world back on
    // top of the real one. Losing one write is recoverable; that is not.
    if (!snap) {
      await pause(attempt);
      continue;
    }
    const result = fn(snap.db);
    if (await saveIfUnchanged(snap.db, snap.etag)) {
      mem = snap.db;
      memAt = Date.now();
      return result;
    }
    await pause(attempt);
  }
  throw new Error(BUSY);
}

function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const run = writeChain.then(async () => {
    if (SERVERLESS) return apply(fn);
    const db = await load();
    const result = fn(db);
    await persist(db);
    return result;
  });
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function listEnvironments(): Promise<Environment[]> {
  const db = await load();
  return Object.values(db.environments).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
}

export async function getEnvironment(id: string): Promise<Environment | null> {
  const db = await load();
  return db.environments[id] ?? null;
}

export async function putEnvironment(env: Environment): Promise<Environment> {
  return mutate((db) => {
    db.environments[env.id] = env;
    return env;
  });
}

export async function getMatch(id: string): Promise<Match | null> {
  const db = await load();
  return db.matches[id] ?? null;
}

export async function putMatch(match: Match): Promise<Match> {
  return mutate((db) => {
    db.matches[match.id] = match;
    return match;
  });
}

export async function appendStep(step: StepRecord): Promise<StepRecord> {
  return mutate((db) => {
    const list = db.steps[step.match_id] ?? [];
    list.push(step);
    db.steps[step.match_id] = list;
    return step;
  });
}

export async function listSteps(matchId: string): Promise<StepRecord[]> {
  const db = await load();
  return db.steps[matchId] ?? [];
}

export async function listMatches(environmentId?: string): Promise<Match[]> {
  const db = await load();
  return Object.values(db.matches)
    .filter((m) => !environmentId || m.environment_id === environmentId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function replaceMatchAndStep(
  match: Match,
  step: StepRecord,
): Promise<{ match: Match; step: StepRecord }> {
  return mutate((db) => {
    db.matches[match.id] = match;
    const list = db.steps[match.id] ?? [];
    list.push(step);
    db.steps[match.id] = list;
    return { match, step };
  });
}
