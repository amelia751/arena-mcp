#!/usr/bin/env node
/**
 * Drives a Vertex model against the real WebMCP tool surface: a Chromium page
 * with document.modelContext, tools discovered with getTools(), calls made with
 * executeTool(). Nothing is reimplemented here — if it works in this harness it
 * works in a browser agent.
 *
 *   node scripts/agent-live.mjs [--task tictactoe|connect4|kuhn|play] [--turns 24] [--headed]
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const BASE = arg("base", process.env.ARENA_BASE || "http://localhost:3000");
const TASK = arg("task", "connect4");
const MAX_TURNS = Number(arg("turns", 24));
const PROJECT = "your-project-id";
const LOCATION = "us-central1";
const MODEL = arg("model", "gemini-2.5-pro");
const RUN = arg("run", String(Date.now()).slice(-6));

const OUT = path.join(process.cwd(), ".data", "live");
mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, `run-${RUN}.jsonl`);
const log = (row) => appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...row }) + "\n");

const CHROME_ARGS = [
  "--enable-experimental-web-platform-features",
  "--enable-features=WebMCPTesting,DevToolsWebMCPSupport",
];

// ---------------------------------------------------------------- schema

const SCALAR = { string: "STRING", integer: "INTEGER", number: "NUMBER", boolean: "BOOLEAN" };

/** Tool answers are prose that may open with a JSON object. */
function leadingJson(text) {
  for (const candidate of [String(text).split("\n")[0], String(text)]) {
    if (!candidate.startsWith("{")) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

function toVertexSchema(schema) {
  if (!schema || typeof schema !== "object") return { type: "OBJECT", properties: {} };
  const t = schema.type;
  if (t === "object") {
    const properties = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      properties[k] = toVertexSchema(v);
    }
    const out = { type: "OBJECT", properties };
    if (schema.required?.length) out.required = schema.required;
    return out;
  }
  if (t === "array") return { type: "ARRAY", items: toVertexSchema(schema.items || { type: "string" }) };
  const out = { type: SCALAR[t] || "STRING" };
  if (schema.description) out.description = String(schema.description).slice(0, 300);
  if (schema.enum) out.enum = schema.enum;
  return out;
}

// ---------------------------------------------------------------- vertex

let cachedToken = { value: null, at: 0 };
function token() {
  if (cachedToken.value && Date.now() - cachedToken.at < 45 * 60_000) return cachedToken.value;
  const value = execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS },
  }).trim();
  cachedToken = { value, at: Date.now() };
  return value;
}

async function generate(contents, declarations, system) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: system }] },
        tools: [{ functionDeclarations: declarations }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 16384 },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const message = body?.error?.message || res.statusText;
    log({ event: "vertex_error", attempt, status: res.status, message });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      continue;
    }
    throw new Error(`Vertex ${res.status}: ${message}`);
  }
  throw new Error("Vertex retries exhausted");
}

// ---------------------------------------------------------------- tasks

const TASKS = {
  connect4: `Design Connect Four as a new environment on this page, then play me.

Rules: 6 rows, 7 columns, gravity so discs fall to the lowest empty slot, four in a row wins
(horizontal, vertical or either diagonal). Actions are col_0 through col_6.

Write all five functions yourself.

I care about how the table looks. Make it a felt board with real discs, and use preview_view with
moves to check the board mid-game before you decide it is done. When every check passes and the
preview has no problems, publish it, start a match against me, and play.`,

  tictactoe: `Design Tic-Tac-Toe as a new environment on this page and then play me. Write all five
functions yourself. Make the table look like ink on paper. Use preview_view to check it before you
publish, then start a match and play.`,

  kuhn: `Design Kuhn Poker as a new environment on this page and then play me.

Three cards (Jack, Queen, King), one dealt to each player, one burned. Each player antes 1. Player
0 acts first and may check or bet 1. Facing a bet you may fold or call. check-check and bet-call go
to showdown, higher card wins the pot. Folding loses what you put in.

The important part: observe() must show a player only their own card. Never both hands, never the
burned card. Write all five functions yourself. Make the table show a real playing card. Check it with preview_view, publish it, then start a match and play me.`,

  // Deliberately says nothing about how it should look: the design has to come
  // from the agent.
  pokemon: `Design a two-player Pokemon-style trading card duel as a new environment on this page,
then play me.

Each player has an active creature and a hand of cards they alone can see. A creature has a name,
hit points, and an attack that costs energy. On your turn you may attach one energy to your active
creature, then either attack or pass. An attack deals its damage to the opposing active creature;
when a creature's hit points reach zero it is knocked out and its owner promotes a fresh creature
from their hand. A player who cannot promote loses. Deal the starting cards with rng.

Work out the details yourself and write all five functions. observe() must show a player their own
hand and never the opponent's. Check it with preview_view, including a position part-way through a
duel, then publish it, start a match against me and play.`,

  // Nothing on the page resembles a bidding game, and the rules are given without a
  // single hint about presentation: whatever the table looks like, the agent chose it.
  dice: `Design Liar's Dice for two players as a new environment on this page, then play me.

Each player rolls five dice at the start and can see only their own. Players alternate bids about
how many dice of a given face are on the table across both hands — each bid must raise the count
or keep the count and raise the face. Instead of bidding you may challenge the last bid: both hands
are revealed, and whoever was wrong about it loses.

Work out the rest yourself and write all five functions. observe() must show a player their own
dice and never the opponent's. Publish it, start a match against me and play.`,

  play: `Look at what is already published on this page with list_environments, open the most
interesting one, start a match against me and play it well. Look at the board with inspect_view
before each of your moves. When the game is over, export the episodes and tell me what is in them.`,
};

// ---------------------------------------------------------------- run

const SYSTEM = `You are working inside a web page that exposes its own tools. You are building a
game environment on it and then playing that game against the person you are talking to.

Work like an engineer with a browser open:
- Call get_authoring_guide first. It is the contract.
- After every change to render(), call preview_view and actually read the picture it returns.
  If the grid it shows does not match the position you asked for, your markup is wrong.
- preview_view({ environment_id, moves: [...] }) shows the board part-way through a game. An empty
  board looks fine even when nothing works, so always check a mid-game position.
- preview_view separates problems from notes. Problems must reach zero. Notes are cosmetic: spend
  at most two rounds on them, then move on. Do not loop on a note you cannot shift.
- Fix validation failures one function at a time with update_environment.
- Finish the whole job. Authoring is not the job — publishing, starting a match, and actually
  playing it out with the person is the job.
- When you play, get_observation before you move and wait_for_turn after, and quote the revision
  you were given.

Call tools rather than describing what you would do. When you are completely finished, say DONE.`;

async function main() {
  const browser = await chromium.launch({ headless: !flag("headed"), args: CHROME_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const pageEvents = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      const text = m.text();
      pageEvents.push({ kind: m.type(), text });
      log({ event: "console", kind: m.type(), text });
    }
  });
  page.on("pageerror", (e) => {
    pageEvents.push({ kind: "pageerror", text: e.message });
    log({ event: "pageerror", text: e.message, stack: e.stack });
  });
  page.on("requestfailed", (r) => {
    log({ event: "requestfailed", url: r.url(), failure: r.failure()?.errorText });
  });
  page.on("response", async (r) => {
    if (r.status() >= 400) {
      log({ event: "http_error", status: r.status(), url: r.url() });
    }
  });

  await page.goto(BASE, { waitUntil: "networkidle" });

  const registered = await page.evaluate(async () => {
    const ctx = document.modelContext;
    if (!ctx) return null;
    const tools = await ctx.getTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: typeof t.inputSchema === "string" ? JSON.parse(t.inputSchema) : t.inputSchema,
    }));
  });
  if (!registered) throw new Error("document.modelContext is not available on the page");

  console.log(`discovered ${registered.length} tools via document.modelContext.getTools()`);
  log({ event: "tools", names: registered.map((t) => t.name) });

  const declarations = registered.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toVertexSchema(t.inputSchema),
  }));

  async function callTool(name, args) {
    return page.evaluate(
      async ([toolName, payload]) => {
        const ctx = document.modelContext;
        const tools = await ctx.getTools();
        const tool = tools.find((t) => t.name === toolName);
        if (!tool) return `error: no tool named ${toolName}`;
        const started = performance.now();
        try {
          const out = await ctx.executeTool(tool, JSON.stringify(payload || {}));
          return { ok: true, ms: Math.round(performance.now() - started), out };
        } catch (e) {
          return { ok: false, ms: Math.round(performance.now() - started), out: `error: ${e.message}` };
        }
      },
      [name, args],
    );
  }

  // Stands in for the person at the table: reads the board, clicks a real
  // control in the live frame, and lets the click travel the whole path.
  const human = { stop: false, moves: 0, seed: 7, task: null };
  function pick(legal) {
    human.seed = (Math.imul(human.seed ^ (human.seed >>> 15), 2246822519) + 12345) >>> 0;
    const middle = legal.filter((a) => /_(2|3|4)$/.test(a));
    const pool = middle.length && human.seed % 3 !== 0 ? middle : legal;
    return pool[human.seed % pool.length];
  }
  async function humanLoop(matchId, humanSeat) {
    log({ event: "human_start", matchId, humanSeat });
    while (!human.stop) {
      await new Promise((r) => setTimeout(r, 1100));
      let state;
      try {
        state = await (await fetch(`${BASE}/api/matches/${matchId}`)).json();
      } catch {
        continue;
      }
      const m = state.match;
      if (!m) continue;
      if (m.terminal) {
        log({ event: "human_done", matchId, rewards: m.rewards, moves: human.moves });
        console.log(`  [human] game over, rewards ${JSON.stringify(m.rewards)}`);
        return;
      }
      if (m.to_move !== humanSeat) continue;
      const view = await (
        await fetch(`${BASE}/api/matches/${matchId}/observation?seat=${humanSeat}`)
      ).json();
      const legal = view.legal_actions || [];
      if (!legal.length) continue;
      const choice = pick(legal);
      try {
        const control = page.frameLocator(".game-host iframe").locator(`[data-action="${choice}"]`);
        await control.click({ timeout: 4000 });
        human.moves++;
        console.log(`  [human] clicked ${choice} in the live table`);
        log({ event: "human_move", matchId, action: choice, legal });
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`  [human] could not click ${choice}: ${e.message.split("\n")[0]}`);
        log({ event: "human_click_failed", action: choice, message: e.message.slice(0, 400) });
        await page.waitForTimeout(1200);
      }
    }
  }

  const shot = async (label) => {
    const file = path.join(OUT, `${RUN}-${label}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    return file;
  };

  const task = TASKS[TASK] || TASK;
  const contents = [{ role: "user", parts: [{ text: task }] }];
  const seen = { created: null, published: false, matchId: null, moves: 0, previews: 0 };
  const toolErrors = [];
  let nudges = 0;
  let stalled = 0;

  console.log(`task=${TASK} model=${MODEL} log=${LOG}`);
  log({ event: "start", task: TASK, model: MODEL, base: BASE });

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    let data;
    try {
      data = await generate(contents, declarations, SYSTEM);
    } catch (e) {
      console.log("vertex failed:", e.message);
      log({ event: "abort", reason: e.message });
      break;
    }
    let candidate = data.candidates?.[0];
    let parts = candidate?.content?.parts || [];
    let calls = parts.filter((p) => p.functionCall);

    // Gemini sometimes derails mid-JSON on a long code payload. It is almost
    // always transient, so retry the same turn before giving up.
    let malformed = 0;
    while (!calls.length && candidate?.finishReason === "MALFORMED_FUNCTION_CALL" && malformed < 3) {
      malformed++;
      log({ event: "malformed", turn, attempt: malformed, candidate: JSON.stringify(candidate).slice(0, 4000) });
      console.log(`  ! malformed function call, retry ${malformed}/3`);
      await new Promise((r) => setTimeout(r, 1500 * malformed));
      const nudge = contents.concat([
        {
          role: "user",
          parts: [
            {
              text:
                malformed < 2
                  ? "Your last tool call did not parse. Send it again. If a code payload is long, send one function at a time with update_environment instead of all five at once."
                  : "That still did not parse. Send exactly one tool call, with the smallest payload that makes progress — a single function body, not all five.",
            },
          ],
        },
      ]);
      data = await generate(nudge, declarations, SYSTEM);
      candidate = data.candidates?.[0];
      parts = candidate?.content?.parts || [];
      calls = parts.filter((p) => p.functionCall);
    }

    const text = parts.filter((p) => p.text).map((p) => p.text).join("\n").trim();
    if (text) console.log(`\n[${turn}] model: ${text.slice(0, 500)}`);
    log({
      event: "model",
      turn,
      text: text.slice(0, 3000),
      finishReason: candidate?.finishReason,
      calls: calls.map((c) => c.functionCall.name),
    });

    if (!calls.length) {
      // A person at the table would say "go on" rather than close the tab. This
      // applies while it is still writing the game, not only once a match is live:
      // a turn the model declines to answer is the cheapest thing to recover from.
      const recited = candidate?.finishReason === "RECITATION";
      const live = !/\bDONE\b/.test(text) && nudges < 4;
      log({
        event: live ? "nudge" : "stop",
        turn,
        reason: candidate?.finishReason || "no_calls",
        candidate: JSON.stringify(candidate || {}).slice(0, 3000),
      });
      if (live) {
        nudges++;
        console.log(
          `\n[${turn}] no tool calls (${candidate?.finishReason || "none"}) — nudging (${nudges}/4)`,
        );
        if (text) contents.push({ role: "model", parts: [{ text }] });
        contents.push({
          role: "user",
          parts: [
            {
              text: recited
                ? "That reply was withheld for looking like something recited. Write this part yourself instead — your own structure and names, not a well-known implementation — and send it as a single tool call."
                : seen.matchId
                  ? "Go on — keep playing. Use the tools; do not wait for me to say anything."
                  : "Go on — keep building. Use the tools; do not wait for me to say anything.",
            },
          ],
        });
        await new Promise((r) => setTimeout(r, recited ? 2000 : 0));
        continue;
      }
      console.log(`\n[${turn}] no tool calls — finish reason ${candidate?.finishReason}`);
      break;
    }

    contents.push({ role: "model", parts });
    const responses = [];
    for (const c of calls) {
      const name = c.functionCall.name;
      const args = c.functionCall.args || {};
      const brief = JSON.stringify(args);
      console.log(`  -> ${name} ${brief.length > 220 ? brief.slice(0, 220) + "…" : brief}`);
      const res = await callTool(name, args);
      const out = typeof res === "string" ? res : res.out;
      const ms = typeof res === "string" ? 0 : res.ms;
      const flat = typeof out === "string" ? out : JSON.stringify(out);
      const isError =
        flat.startsWith("error:") || /"error"\s*:/.test(flat.slice(0, 200));
      if (isError) toolErrors.push({ turn, name, args, out: flat.slice(0, 600) });
      console.log(`  <- ${name} ${ms}ms ${isError ? "ERROR " : ""}${flat.slice(0, 400).replace(/\n/g, "\n     ")}`);
      log({ event: "tool", turn, name, args, ms, error: isError, out: flat.slice(0, 6000) });

      if (name === "create_environment") {
        seen.created = leadingJson(flat)?.environment?.id ?? seen.created;
      }
      if (name === "publish_environment" && !isError) seen.published = true;
      if (name === "preview_view" || name === "inspect_view") {
        seen.previews++;
        await shot(`t${turn}-${name}`);
      }
      if (name === "start_match" && !isError) {
        const started = leadingJson(flat);
        seen.matchId = started?.match_id ?? seen.matchId;
        if (seen.matchId && !human.task) {
          human.task = humanLoop(seen.matchId, started?.human_seat ?? 0).catch((e) =>
            log({ event: "human_crash", message: e.message }),
          );
        } else if (!seen.matchId) {
          console.log(`  ! start_match answered without a match id — no human will join`);
          log({ event: "start_match_unparsed", out: flat.slice(0, 800) });
        }
        await shot(`t${turn}-match`);
      }
      if (name === "wait_for_turn") {
        if (flat.startsWith("still_waiting")) {
          stalled++;
          if (stalled >= 5 && human.moves === 0) {
            console.log("  ! the agent is waiting but nobody is playing back — stopping");
            log({ event: "deadlock", turn, humanMoves: human.moves });
            turn = MAX_TURNS + 1;
          }
        } else {
          stalled = 0;
        }
      }
      if (name === "take_action" && !isError) {
        seen.moves++;
        await shot(`t${turn}-move${seen.moves}`);
      }

      responses.push({
        functionResponse: {
          name,
          response: { result: flat.length > 9000 ? flat.slice(0, 9000) + "…" : flat },
        },
      });
    }
    contents.push({ role: "user", parts: responses });

    if (/\bDONE\b/.test(text)) {
      log({ event: "model_done", turn });
      break;
    }
  }

  human.stop = true;
  await Promise.race([human.task ?? Promise.resolve(), new Promise((r) => setTimeout(r, 3000))]);

  let episodes = null;
  if (seen.matchId) {
    try {
      const res = await (await fetch(`${BASE}/api/episodes?match_id=${seen.matchId}`)).json();
      episodes = { rows: res.records?.length ?? 0, jsonl: res.jsonl?.slice(0, 1200) };
      log({ event: "episodes", matchId: seen.matchId, rows: episodes.rows });
    } catch (e) {
      log({ event: "episodes_failed", message: e.message });
    }
  }

  const finalShot = await shot("final");
  const summary = {
    ...seen,
    humanMoves: human.moves,
    trajectoryRows: episodes?.rows ?? 0,
    toolErrors: toolErrors.length,
    pageErrors: pageEvents.length,
    log: LOG,
    finalShot,
  };
  writeFileSync(path.join(OUT, `run-${RUN}-summary.json`), JSON.stringify({ summary, toolErrors, pageEvents }, null, 2));
  console.log("\n==== summary ====");
  console.log(JSON.stringify(summary, null, 2));
  if (toolErrors.length) {
    console.log("\n==== tool errors ====");
    for (const e of toolErrors.slice(0, 20)) {
      console.log(`turn ${e.turn} ${e.name}: ${e.out.replace(/\n/g, " ").slice(0, 300)}`);
    }
  }
  if (pageEvents.length) {
    console.log("\n==== page errors ====");
    for (const e of pageEvents.slice(0, 15)) console.log(`${e.kind}: ${e.text.slice(0, 250)}`);
  }
  if (episodes?.jsonl) {
    console.log("\n==== trajectory head ====");
    console.log(episodes.jsonl.split("\n").slice(0, 3).join("\n"));
  }
  log({ event: "end", ...summary });

  await browser.close();
  process.exit(toolErrors.length || pageEvents.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  log({ event: "crash", message: e.message, stack: e.stack });
  process.exit(3);
});
