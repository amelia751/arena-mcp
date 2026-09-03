/**
 * The store must never save a database it could not read first.
 *
 * A warm instance keeps the last copy it read. If a read fails and the write
 * goes ahead anyway, that old copy lands on top of the real one and every game
 * written in between is gone. This is the test for that.
 */
process.env.NETLIFY = "1";

const { control } = await import("./blobs-stub.mjs");
const store = await import("../src/lib/store.ts");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function env(id, name) {
  return {
    id,
    name,
    description: name,
    code: "",
    players: 2,
    revision: 1,
    published: false,
    created_at: new Date().toISOString(),
    kind: "authored",
  };
}

// One game exists, and this instance reads it — that is what warms the cache.
control.seed("db.json", { environments: { a: env("a", "First") }, matches: {}, steps: {} });
const first = await store.listEnvironments();
check("reads the seeded game", first.length === 1, `saw ${first.length}`);

// Somewhere else, a second game is written. This instance has not seen it.
control.seed("db.json", {
  environments: { a: env("a", "First"), b: env("b", "Second") },
  matches: {},
  steps: {},
});

// Now the store stops answering, and a write is attempted anyway.
control.failReads = true;
const writesBefore = control.writes;
let threw = null;
try {
  await store.putEnvironment(env("c", "Third"));
} catch (err) {
  threw = err;
}

check("a write on top of an unreadable store is refused", threw !== null, threw ? "" : "it saved");
check("nothing was written", control.writes === writesBefore, `${control.writes - writesBefore} writes`);

const after = control.raw("db.json");
const names = Object.keys(after.environments).sort().join(",");
check("the store still holds both games", names === "a,b", `holds ${names}`);

// Reading is allowed to be stale — a slightly old page beats an error page.
let readThrew = null;
let stale = [];
try {
  stale = await store.listEnvironments();
} catch (err) {
  readThrew = err;
}
check("reads survive the outage", readThrew === null, String(readThrew ?? ""));
check("a read falls back to the last good copy", stale.length === 1, `saw ${stale.length}`);

// When the store comes back, writes build on what is really there.
control.failReads = false;
await store.putEnvironment(env("c", "Third"));
const healed = Object.keys(control.raw("db.json").environments).sort().join(",");
check("a recovered write keeps every game", healed === "a,b,c", `holds ${healed}`);

// A write that never lands must not report success.
control.failWrites = true;
let writeThrew = null;
try {
  await store.putEnvironment(env("d", "Fourth"));
} catch (err) {
  writeThrew = err;
}
check("a failed save is reported", writeThrew !== null, writeThrew ? "" : "it claimed success");

console.log(failures ? `\n${failures} failed` : "\nstore holds up");
process.exit(failures ? 1 : 0);
