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
let blobStore: BlobStore | false | null = null;

async function blobs(): Promise<BlobStore | null> {
  if (!SERVERLESS) return null;
  if (blobStore === null) {
    try {
      const { getStore } = await import("@netlify/blobs");
      blobStore = getStore({ name: "arena", consistency: "strong" }) as BlobStore;
    } catch {
      blobStore = false;
    }
  }
  return blobStore || null;
}

async function load(): Promise<DB> {
  if (SERVERLESS) {
    const store = await blobs();
    if (store) {
      try {
        const raw = await store.get(BLOB_KEY);
        mem = reconcile(raw ? (JSON.parse(raw) as DB) : empty());
        return mem;
      } catch {
        // A blob read failure should not take the page down.
      }
    }
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
  if (SERVERLESS) {
    const store = await blobs();
    if (store) {
      try {
        await store.setJSON(BLOB_KEY, db);
      } catch {
        // Falls back to process memory for the life of this instance.
      }
    }
    return;
  }
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

function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const run = writeChain.then(async () => {
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
