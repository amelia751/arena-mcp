/**
 * The store holds one document that the page, the agent and the bot all write
 * to at once. These are the two ways that goes wrong: saving on top of a copy
 * we could not read, and saving on top of a copy somebody else just changed.
 * Both erase work that already landed, and both look like the site losing data.
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

const db = (envs) => ({
  environments: Object.fromEntries(envs.map((e) => [e, env(e, e)])),
  matches: {},
  steps: {},
});

const names = () => Object.keys(control.raw("db.json").environments).sort().join(",");
const settle = () => new Promise((r) => setTimeout(r, 1000));

// ── A write must not land on a copy we could not read ────────────────────────
control.reset();
control.seed("db.json", db(["a"]));
check("reads the seeded game", (await store.listEnvironments()).length === 1);

control.seed("db.json", db(["a", "b"])); // written elsewhere; this instance has not seen it
control.failReads = true;
let threw = null;
try {
  await store.putEnvironment(env("c", "Third"));
} catch (err) {
  threw = err;
}
check("a write on an unreadable store is refused", threw !== null, threw ? "" : "it saved");
check("the store still holds both games", names() === "a,b", `holds ${names()}`);

// Reading may be stale — a slightly old page beats an error page.
let readThrew = null;
try {
  await store.listEnvironments();
} catch (err) {
  readThrew = err;
}
check("reads survive the outage", readThrew === null, String(readThrew ?? ""));

control.failReads = false;
await settle();
await store.putEnvironment(env("c", "Third"));
check("a recovered write keeps every game", names() === "a,b,c", `holds ${names()}`);

// ── A write must not land on a copy somebody else just changed ───────────────
control.reset();
control.seed("db.json", db(["a"]));
await store.listEnvironments();
await settle();

// Between this write's read and its save, another instance adds a game.
control.afterNextRead = () => {
  const now = control.raw("db.json");
  now.environments.rival = env("rival", "Rival");
  control.seed("db.json", now);
};
await store.putEnvironment(env("mine", "Mine"));
check(
  "a racing write keeps both games",
  names() === "a,mine,rival",
  `holds ${names()}`,
);
check(
  "the losing save was refused, not silently applied",
  control.refused > 0,
  control.refused > 0 ? `${control.refused} refused` : "nothing was refused",
);

// ── A step appended during a race must survive, exactly once ─────────────────
control.reset();
control.seed("db.json", { environments: {}, matches: {}, steps: { m1: [{ n: 0 }] } });
await store.listSteps("m1");
await settle();
control.afterNextRead = () => {
  const now = control.raw("db.json");
  now.steps.m1.push({ n: 1 });
  control.seed("db.json", now);
};
await store.appendStep({ match_id: "m1", n: 2 });
const steps = control.raw("db.json").steps.m1.map((s) => s.n).join(",");
check("both moves are recorded, neither twice", steps === "0,1,2", `tape is ${steps}`);

// ── A save that never lands must not report success ──────────────────────────
control.reset();
control.seed("db.json", db(["a"]));
await settle();
control.failWrites = true;
let writeThrew = null;
try {
  await store.putEnvironment(env("d", "Fourth"));
} catch (err) {
  writeThrew = err;
}
check("a failed save is reported", writeThrew !== null, writeThrew ? "" : "it claimed success");

// ── Polling must not cost a round trip every time ────────────────────────────
control.reset();
control.seed("db.json", db(["a"]));
await settle();
const before = control.reads;
await Promise.all([
  store.listEnvironments(),
  store.listEnvironments(),
  store.listEnvironments(),
  store.listEnvironments(),
]);
const spent = control.reads - before;
check("four simultaneous polls share one read", spent === 1, `used ${spent} reads`);

console.log(failures ? `\n${failures} failed` : "\nstore holds up");
process.exit(failures ? 1 : 0);
