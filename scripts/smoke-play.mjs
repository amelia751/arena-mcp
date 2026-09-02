#!/usr/bin/env node
/** Human clicks the live table, agent answers through the tools. Checks the whole path. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3080";
const ENV = process.argv[3] || "env_connect_four";
const OUT = path.join(process.cwd(), ".data", "smoke");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-experimental-web-platform-features", "--enable-features=WebMCPTesting"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE ERROR:", m.text()));
await page.goto(BASE, { waitUntil: "networkidle" });

const call = (name, args) =>
  page.evaluate(
    async ([n, a]) => {
      const ctx = document.modelContext;
      const tool = (await ctx.getTools()).find((t) => t.name === n);
      if (!tool) return `no tool ${n}`;
      try {
        return await ctx.executeTool(tool, JSON.stringify(a || {}));
      } catch (e) {
        return "error: " + e.message;
      }
    },
    [name, args],
  );

console.log("--- start_match ---");
const started = JSON.parse(await call("start_match", { environment_id: ENV, agent_label: "smoke-agent" }));
console.log(started);
const matchId = started.match_id;
const humanSeat = started.human_seat;
const agentSeat = started.your_seat;

const state = async () => (await fetch(`${BASE}/api/matches/${matchId}`)).json();
const obs = async (seat) =>
  (await fetch(`${BASE}/api/matches/${matchId}/observation?seat=${seat}`)).json();

for (let round = 1; round <= 6; round++) {
  let s = await state();
  if (s.match.terminal) break;

  if (s.match.to_move === humanSeat) {
    const o = await obs(humanSeat);
    const choice = o.legal_actions[Math.floor(o.legal_actions.length / 2)];
    console.log(`\n[human] clicking ${choice}`);
    await page.frameLocator(".game-host iframe").locator(`[data-action="${choice}"]`).click({ timeout: 5000 });
    await page.waitForTimeout(700);
    s = await state();
    console.log(`[human] match revision now ${s.match.revision}, to_move ${s.match.to_move}, steps ${s.steps.length}`);
    if (s.match.revision === 1) throw new Error("human click did not register");
  }

  s = await state();
  if (s.match.terminal) break;
  if (s.match.to_move === agentSeat) {
    const view = JSON.parse(await call("get_observation", {}));
    const choice = view.legal_actions[0];
    console.log(`[agent] take_action ${choice} at revision ${view.revision}`);
    const res = await call("take_action", {
      action: choice,
      expected_revision: view.revision,
      rationale: "smoke test",
      confidence: 3,
    });
    console.log(`[agent] ${String(res).slice(0, 220)}`);
  }
}

await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "play-final.png"), fullPage: true });

console.log("\n--- inspect_view ---");
console.log(await call("inspect_view", {}));

console.log("\n--- export_episodes ---");
const ep = JSON.parse(await call("export_episodes", {}));
const lines = String(ep.jsonl || "").split("\n").filter(Boolean);
console.log(`${lines.length} jsonl rows`);
for (const l of lines) {
  const row = JSON.parse(l);
  if (row.type === "episode") console.log(`episode ${row.match_id} seats=${JSON.stringify(row.seats.map((s) => s.interface))}`);
  else console.log(`  step ${row.index} seat=${row.seat} by=${row.interface} action=${row.action} r=${row.reward} conf=${row.confidence}`);
}

await browser.close();
