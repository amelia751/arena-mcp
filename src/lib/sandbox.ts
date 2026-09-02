import "server-only";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import releaseSync from "@jitl/quickjs-singlefile-cjs-release-sync";
import type { EnvCode } from "./types";

type QuickJSModule = Awaited<ReturnType<typeof newQuickJSWASMModuleFromVariant>>;

let modulePromise: Promise<QuickJSModule> | undefined;

export function getQuickJS(): Promise<QuickJSModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(
    // CJS default interop — the variant is the module itself.
    (releaseSync as { default?: typeof releaseSync }).default ?? releaseSync,
  );
  return modulePromise;
}

const PRELUDE = `
  delete globalThis.Date;
  delete globalThis.fetch;
  delete globalThis.XMLHttpRequest;
  delete globalThis.WebSocket;
  delete globalThis.process;
  delete globalThis.require;
  delete globalThis.setTimeout;
  delete globalThis.setInterval;
  Math.random = function () {
    throw new Error("Math.random is not available; use rng(state.rng_cursor) and store the next cursor in state");
  };
  globalThis.rng = function (s) {
    var t = (s + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  globalThis.__hash = function (v) {
    var s = JSON.stringify(v);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16);
  };
  globalThis.__clone = function (v) { return JSON.parse(JSON.stringify(v)); };
`;

const DRIVER = `
function __fields(obj, prefix, out) {
  if (obj === null || typeof obj !== "object") { out.push(prefix); return; }
  if (Array.isArray(obj)) {
    if (obj.length === 0) { out.push(prefix); return; }
    var primitives = true;
    for (var i = 0; i < obj.length; i++) {
      if (obj[i] !== null && typeof obj[i] === "object") { primitives = false; break; }
    }
    if (primitives && obj.length <= 16) {
      for (var j = 0; j < obj.length; j++) out.push(prefix + "." + j);
      return;
    }
    if (primitives) { out.push(prefix); return; }
    for (var k = 0; k < obj.length; k++) __fields(obj[k], prefix + "." + k, out);
    return;
  }
  var keys = Object.keys(obj);
  if (keys.length === 0) { out.push(prefix); return; }
  for (var n = 0; n < keys.length; n++) {
    var key = keys[n];
    __fields(obj[key], prefix ? prefix + "." + key : key, out);
  }
}
function __get(obj, path) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}
function __set(obj, path, value) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) return;
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function __perturb(v) {
  if (typeof v === "number") return v + 977;
  if (typeof v === "string") return v + "__PERTURBED__";
  if (typeof v === "boolean") return !v;
  if (v == null) return 1;
  return "__PERTURBED__";
}
// Type-preserving, so render() sees a plausible alternative value rather than
// a shape it was never written to handle.
function __nudge(v) {
  if (typeof v === "number") return v === 0 ? 1 : 0;
  if (typeof v === "string") return v === "" ? "x" : v.charAt(0) === "z" ? "a" : "z";
  if (typeof v === "boolean") return !v;
  if (v === null) return 0;
  return undefined;
}
function __empty(v) {
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === "object") return Object.keys(v).length === 0;
  return false;
}
function __brief(v) {
  var s;
  try { s = JSON.stringify(v); } catch (e) { return "(does not serialize)"; }
  if (s === undefined) return "undefined";
  return s.length > 700 ? s.slice(0, 700) + "… (truncated)" : s;
}
// A playout that blows up is only useful if you can see what it blew up on, so
// every failure carries the position that produced it.
function __fail(msg, fn, e, ctx) {
  var out = { error: msg, fn: fn };
  if (e && e.stack) out.stack = e.stack;
  if (ctx) {
    out.at_step = ctx.n;
    out.seat = ctx.seat;
    out.state = __brief(ctx.state);
    if (ctx.action !== undefined) out.action = ctx.action;
    if (ctx.legal) out.legal = ctx.legal.slice(0, 12);
  }
  return out;
}
function __one(seed, policy_seed, max_steps, collect) {
  var state = init(seed);
  if (state == null || typeof state !== "object") return { error: "init must return an object", fn: "init" };
  var cursor = policy_seed, n = 0;
  var hashes = [__hash(state)];
  var actions = [];
  var lastObs = null, lastLegal = null, lastSeat = null;
  while (n < max_steps) {
    var seat = state.to_move;
    var here = { n: n, seat: seat, state: state };
    if (typeof seat !== "number") return __fail("state.to_move must be the current seat (number)", "init/step", null, here);
    var legal;
    try { legal = legal_actions(state, seat); }
    catch (e) { return __fail(String(e && e.message || e), "legal_actions", e, here); }
    if (!Array.isArray(legal)) return __fail("legal_actions must return an array of strings", "legal_actions", null, here);
    if (!legal.length) return __fail("legal_actions is empty on a non-terminal state at step " + n, "legal_actions", null, here);
    for (var i = 0; i < legal.length; i++) {
      if (typeof legal[i] !== "string") return __fail("legal_actions[" + i + "] is not a string", "legal_actions", null, here);
    }
    here.legal = legal;
    var obs;
    try { obs = observe(state, seat); }
    catch (e) { return __fail(String(e && e.message || e), "observe", e, here); }
    lastObs = obs; lastLegal = legal; lastSeat = seat;
    var a = legal[Math.floor(rng(cursor++) * legal.length)];
    here.action = a;
    var r;
    try { r = step(state, a); }
    catch (e) { return __fail(String(e && e.message || e), "step", e, here); }
    if (!r || typeof r !== "object") return __fail("step must return { state, rewards, terminal }", "step", null, here);
    if (!r.state || typeof r.state !== "object") return __fail("step().state missing", "step", null, here);
    if (!Array.isArray(r.rewards)) return __fail("step().rewards must be a number array", "step", null, here);
    if (typeof r.terminal !== "boolean") return __fail("step().terminal must be a boolean", "step", null, here);
    actions.push(a);
    state = r.state;
    hashes.push(__hash(state));
    n++;
    if (r.terminal) {
      var out = { steps: n, actions: actions, rewards: r.rewards, trace: __hash(hashes), last_obs: lastObs, last_legal: lastLegal, last_seat: lastSeat };
      if (collect) {
        try { out.render = render(lastObs); }
        catch (e) { out.render_error = String(e && e.message || e); }
      }
      return out;
    }
  }
  return __fail("did not terminate within " + max_steps + " steps", "step", null, {
    n: n,
    seat: state.to_move,
    state: state,
    legal: actions.slice(-8),
  });
}

globalThis.__init = function (j) {
  var a = JSON.parse(j);
  return JSON.stringify(init(a.seed));
};
globalThis.__legal = function (j) {
  var a = JSON.parse(j);
  return JSON.stringify(legal_actions(a.state, a.player));
};
globalThis.__observe = function (j) {
  var a = JSON.parse(j);
  return JSON.stringify(observe(a.state, a.player));
};
globalThis.__step = function (j) {
  var a = JSON.parse(j);
  return JSON.stringify(step(a.state, a.action));
};
globalThis.__render = function (j) {
  var a = JSON.parse(j);
  return JSON.stringify(render(a.observation));
};
globalThis.__playout = function (j) {
  var a = JSON.parse(j);
  return JSON.stringify(__one(a.seed, a.policy_seed, a.max_steps || 200, !!a.collect));
};
// Step through a game one move at a time and record what each function saw, so a
// broken rule set can be read like a stack trace instead of guessed at.
globalThis.__trace = function (j) {
  var a = JSON.parse(j);
  var want = a.actions || [];
  var max = a.max_steps || 12;
  var cursor = a.policy_seed == null ? 7 : a.policy_seed;
  var rows = [];
  var state;
  try { state = init(a.seed || 0); }
  catch (e) { return JSON.stringify({ rows: rows, stopped: "init threw: " + String(e && e.message || e) }); }
  if (state == null || typeof state !== "object") {
    return JSON.stringify({ rows: rows, stopped: "init did not return an object" });
  }
  for (var n = 0; n < max; n++) {
    var row = { n: n, state: __brief(state) };
    var seat = state.to_move;
    row.seat = seat;
    if (typeof seat !== "number") {
      row.error = "state.to_move is " + __brief(seat) + ", which is not a seat number";
      rows.push(row); return JSON.stringify({ rows: rows, stopped: "init/step" });
    }
    try { row.legal = legal_actions(state, seat); }
    catch (e) { row.error = "legal_actions threw: " + String(e && e.message || e); rows.push(row); return JSON.stringify({ rows: rows, stopped: "legal_actions" }); }
    if (!Array.isArray(row.legal)) { row.error = "legal_actions did not return an array"; rows.push(row); return JSON.stringify({ rows: rows, stopped: "legal_actions" }); }
    try { row.observation = __brief(observe(state, seat)); }
    catch (e) { row.error = "observe threw: " + String(e && e.message || e); rows.push(row); return JSON.stringify({ rows: rows, stopped: "observe" }); }
    if (!row.legal.length) { row.error = "no legal actions here, and the game has not ended"; rows.push(row); return JSON.stringify({ rows: rows, stopped: "legal_actions" }); }
    var action;
    if (n < want.length) {
      action = want[n];
      if (row.legal.indexOf(action) < 0) {
        row.action = action;
        row.error = "you asked for " + action + ", which is not legal here";
        rows.push(row); return JSON.stringify({ rows: rows, stopped: "illegal action requested" });
      }
    } else {
      action = row.legal[Math.floor(rng(cursor++) * row.legal.length)];
    }
    row.action = action;
    var r;
    try { r = step(state, action); }
    catch (e) { row.error = "step threw: " + String(e && e.message || e); rows.push(row); return JSON.stringify({ rows: rows, stopped: "step" }); }
    if (!r || typeof r !== "object" || !r.state) { row.error = "step did not return { state, rewards, terminal }"; rows.push(row); return JSON.stringify({ rows: rows, stopped: "step" }); }
    row.rewards = r.rewards;
    row.terminal = !!r.terminal;
    rows.push(row);
    state = r.state;
    if (r.terminal) return JSON.stringify({ rows: rows, stopped: "the game ended", final: __brief(state) });
  }
  return JSON.stringify({ rows: rows, stopped: "reached the step limit without ending", final: __brief(state) });
};
globalThis.__sweep = function (j) {
  var a = JSON.parse(j);
  var n = a.n || 300, max = a.max_steps || 200;
  var steps = 0, w = [0, 0, 0], first = null;
  for (var i = 0; i < n; i++) {
    var p = __one(i + (a.seed0 || 0), i * 31 + 5, max, i === 0);
    if (p.error) {
      p.at = i;
      p.seed = i + (a.seed0 || 0);
      return JSON.stringify(p);
    }
    steps += p.steps;
    if (p.rewards[0] > 0) w[0]++;
    else if (p.rewards[0] < 0) w[1]++;
    else w[2]++;
    if (i === 0) first = p;
  }
  return JSON.stringify({ n: n, steps: steps, balance: w, sample: first });
};
globalThis.__replay = function (j) {
  var a = JSON.parse(j);
  var state = init(a.seed);
  var hashes = [__hash(state)];
  for (var i = 0; i < a.actions.length; i++) {
    var r = step(state, a.actions[i]);
    state = r.state;
    hashes.push(__hash(state));
  }
  return JSON.stringify({ trace: __hash(hashes), terminal: true });
};
globalThis.__illegal = function (j) {
  var a = JSON.parse(j);
  var state = init(a.seed);
  var legal = legal_actions(state, state.to_move);
  var probe = a.action || "__not_a_real_action__";
  try {
    var r = step(state, probe);
    return JSON.stringify({ accepted: true, result: r, legal: legal });
  } catch (e) {
    return JSON.stringify({ accepted: false, error: String(e && e.message || e), legal: legal });
  }
};
function __corrupt(v, prefix, out) {
  if (out.length > 6) return;
  if (v === undefined) { out.push((prefix || "(the value itself)") + " is undefined"); return; }
  if (typeof v === "number" && !isFinite(v)) { out.push(prefix + " is " + String(v)); return; }
  if (Array.isArray(v)) {
    for (var i = 0; i < v.length; i++) __corrupt(v[i], prefix + "[" + i + "]", out);
    return;
  }
  if (v && typeof v === "object") {
    var keys = Object.keys(v);
    for (var k = 0; k < keys.length; k++) {
      __corrupt(v[keys[k]], prefix ? prefix + "." + keys[k] : keys[k], out);
    }
  }
}
// A seat that cannot see its own deal is playing blind. Deal many times, count
// how many distinct opening observations each seat gets, and check that nothing
// came out undefined along the way.
globalThis.__deal_visibility = function (j) {
  var a = JSON.parse(j);
  var players = a.players || 2;
  var seeds = a.seeds || 24;
  var seen = [];
  var samples = [];
  var rot = [];
  for (var p = 0; p < players; p++) { seen.push({}); samples.push(null); }
  for (var s = 0; s < seeds; s++) {
    var state;
    try { state = init(s * 7919 + 3); }
    catch (e) { return JSON.stringify({ error: String(e && e.message || e), fn: "init" }); }
    if (s < 3 && rot.length < 4) __corrupt(state, "state", rot);
    for (var p2 = 0; p2 < players; p2++) {
      var obs;
      try { obs = observe(state, p2); }
      catch (e) { return JSON.stringify({ error: String(e && e.message || e), fn: "observe" }); }
      if (s < 3 && rot.length < 6) __corrupt(obs, "observe(state, " + p2 + ")", rot);
      seen[p2][__hash(obs)] = 1;
      if (samples[p2] === null) samples[p2] = obs;
    }
  }
  var distinct = [];
  for (var p3 = 0; p3 < players; p3++) distinct.push(Object.keys(seen[p3]).length);
  return JSON.stringify({ distinct: distinct, samples: samples, corrupt: rot });
};
// For every field in the observation, change it and see whether render() paints
// anything different. A field that never changes the markup is invisible to the
// person at the table.
globalThis.__render_coverage = function (j) {
  var a = JSON.parse(j);
  var state = init(a.seed || 0);
  var cursor = a.policy_seed || 1;
  var depth = a.depth || 0;
  for (var d = 0; d < depth; d++) {
    var legal;
    try { legal = legal_actions(state, state.to_move); } catch (e) { break; }
    if (!legal || !legal.length) break;
    var r;
    try { r = step(state, legal[Math.floor(rng(cursor++) * legal.length)]); } catch (e) { break; }
    state = r.state;
    if (r.terminal) break;
  }
  var seat = typeof state.to_move === "number" ? state.to_move : 0;
  var obs;
  try { obs = observe(state, seat); }
  catch (e) { return JSON.stringify({ error: String(e && e.message || e), fn: "observe" }); }
  var base;
  try { base = __hash(render(obs)); }
  catch (e) { return JSON.stringify({ error: String(e && e.message || e), fn: "render" }); }
  var fields = [];
  __fields(obs, "", fields);
  var painted = [], dark = [], skipped = [];
  for (var i = 0; i < fields.length && i < 120; i++) {
    var f = fields[i];
    var value = __get(obs, f);
    if (__empty(value)) { skipped.push(f); continue; }
    var alt = __nudge(value);
    if (alt === undefined) { skipped.push(f); continue; }
    var copy = __clone(obs);
    __set(copy, f, alt);
    var h;
    try { h = __hash(render(copy)); } catch (e) { h = base; }
    if (h !== base) painted.push(f); else dark.push(f);
  }
  return JSON.stringify({ seat: seat, painted: painted, dark: dark, skipped: skipped });
};
globalThis.__info_flow = function (j) {
  var a = JSON.parse(j);
  var players = a.players || 2;
  var state = init(a.seed);
  var fields = [];
  __fields(state, "", fields);
  var base = [];
  for (var s = 0; s < players; s++) {
    try { base[s] = __hash(observe(state, s)); }
    catch (e) { return JSON.stringify({ error: String(e && e.message || e), fn: "observe" }); }
  }
  var rows = [];
  for (var i = 0; i < fields.length && i < 40; i++) {
    var f = fields[i];
    var seats = [];
    for (var p = 0; p < players; p++) {
      var copy = __clone(state);
      __set(copy, f, __perturb(__get(copy, f)));
      var h;
      try { h = __hash(observe(copy, p)); }
      catch (e) { h = "err"; }
      seats.push(h !== base[p]);
    }
    rows.push({ field: f, visible: seats });
  }
  return JSON.stringify({ fields: fields, rows: rows });
};
`;

export type Realm = {
  call: <T = unknown>(fn: string, arg: unknown, ms?: number) => T;
  dispose: () => void;
};

function formatDump(dump: unknown): { message: string; stack?: string; fn?: string } {
  if (dump && typeof dump === "object") {
    const d = dump as { message?: string; stack?: string; name?: string };
    const message = d.message || JSON.stringify(dump);
    return { message, stack: d.stack };
  }
  return { message: String(dump) };
}

export class SandboxError extends Error {
  fn?: string;
  stackFromGuest?: string;
  constructor(message: string, fn?: string, stack?: string) {
    super(message);
    this.fn = fn;
    this.stackFromGuest = stack;
  }
}

export async function makeRealm(code: EnvCode, opts?: { memoryMB?: number }): Promise<Realm> {
  const QJS = await getQuickJS();
  const runtime = QJS.newRuntime();
  runtime.setMemoryLimit((opts?.memoryMB ?? 32) * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 512);
  const ctx = runtime.newContext();
  let deadline = Infinity;
  runtime.setInterruptHandler(() => performance.now() > deadline);
  const budget = (ms: number) => {
    deadline = performance.now() + ms;
  };

  const evalOrThrow = (src: string, label: string) => {
    budget(2000);
    const r = ctx.evalCode(src);
    if (r.error) {
      const dump = formatDump(ctx.dump(r.error));
      r.error.dispose();
      throw new SandboxError(`${label}: ${dump.message}`, label, dump.stack);
    }
    r.value.dispose();
  };

  evalOrThrow(PRELUDE, "prelude");
  const parts: [keyof EnvCode, string][] = [
    ["init", code.init],
    ["legal_actions", code.legal_actions],
    ["observe", code.observe],
    ["step", code.step],
    ["render", code.render],
  ];
  for (const [name, src] of parts) {
    if (!src || !src.trim()) {
      throw new SandboxError(`${name} is empty — send the function source`, name);
    }
    evalOrThrow(src, name);
  }
  evalOrThrow(DRIVER, "driver");

  const call = <T = unknown>(fnName: string, arg: unknown, ms = 4000): T => {
    budget(ms);
    const fn = ctx.getProp(ctx.global, fnName);
    const a = ctx.newString(JSON.stringify(arg));
    const res = ctx.callFunction(fn, ctx.undefined, a);
    a.dispose();
    fn.dispose();
    if (res.error) {
      const dump = formatDump(ctx.dump(res.error));
      res.error.dispose();
      throw new SandboxError(dump.message, fnName, dump.stack);
    }
    const text = ctx.getString(res.value);
    res.value.dispose();
    return JSON.parse(text) as T;
  };

  return {
    call,
    dispose: () => {
      ctx.dispose();
      runtime.dispose();
    },
  };
}

export async function withRealm<T>(code: EnvCode, fn: (realm: Realm) => Promise<T> | T): Promise<T> {
  const realm = await makeRealm(code);
  try {
    return await fn(realm);
  } finally {
    realm.dispose();
  }
}
