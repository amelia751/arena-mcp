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
type BlobStore = {
  get: (key: string) => Promise<string | null>;
  setJSON: (key: string, value: unknown) => Promise<unknown>;
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

/** Null means the store did not answer, which is different from an empty store. */
async function readBlob(): Promise<DB | null> {
  const store = await blobs();
  if (!store) return null;
  try {
    const raw = await store.get(BLOB_KEY);
    return reconcile(raw ? (JSON.parse(raw) as DB) : empty());
  } catch (err) {
    complain(err);
    return null;
  }
}

async function load(): Promise<DB> {
  if (SERVERLESS) {
    const fresh = await readBlob();
    if (fresh) {
      mem = fresh;
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
  if (SERVERLESS) {
    const store = await blobs();
    if (!store) throw new Error("the store is unreachable, so nothing was saved");
    // A failed write that reports success is how a move disappears between two
    // screens. Let it reach the caller, who can say so.
    await store.setJSON(BLOB_KEY, db);
    mem = db;
    return;
  }
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

/**
 * A write has to start from the copy that is really in the store.
 *
 * A warm instance keeps the last database it read. Editing that snapshot after a
 * failed read and saving it puts an old world back on top of the real one, which
 * erases every game written in between. Losing one write is recoverable; erasing
 * the store is not. So a write that cannot read first does not happen.
 */
async function loadForWrite(): Promise<DB> {
  if (!SERVERLESS) return load();
  for (let attempt = 0; attempt < 3; attempt++) {
    const fresh = await readBlob();
    if (fresh) {
      mem = fresh;
      return fresh;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
  }
  throw new Error("the store is unreachable, so nothing was saved");
}

function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const run = writeChain.then(async () => {
    const db = await loadForWrite();
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
