#!/usr/bin/env node
/** Calls the real preview_view / inspect_view tools and prints what they answer. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { CONNECT_FOUR, KUHN, TICTACTOE, forget, seed } from "./fixtures.mjs";

const BASE = process.argv[2] || process.env.ARENA_BASE || "http://localhost:3000";
const OUT = path.join(process.cwd(), ".data", "smoke");
mkdirSync(OUT, { recursive: true });

const c4 = await seed(BASE, CONNECT_FOUR);
const ttt = await seed(BASE, TICTACTOE);
const kuhn = await seed(BASE, KUHN);

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-experimental-web-platform-features", "--enable-features=WebMCPTesting"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
});
await page.goto(BASE, { waitUntil: "networkidle" });

async function call(name, args) {
  return page.evaluate(
    async ([n, a]) => {
      const ctx = document.modelContext;
      const tools = await ctx.getTools();
      const tool = tools.find((t) => t.name === n);
      if (!tool) return `no tool ${n}`;
      try {
        return await ctx.executeTool(tool, JSON.stringify(a || {}));
      } catch (e) {
        return "error: " + e.message;
      }
    },
    [name, args],
  );
}

for (const [label, args] of [
  ["connect four, empty", { environment_id: c4 }],
  ["connect four, mid-game", { environment_id: c4, moves: ["col_3", "col_4", "col_3", "col_2"] }],
  ["tic tac toe, mid-game", { environment_id: ttt, moves: ["cell_4", "cell_0", "cell_8"] }],
  ["kuhn poker", { environment_id: kuhn }],
  ["a bad draft", { html: "<div class='b'><div data-action='col_0'></div><div data-action='col_1'></div></div>", css: ".b{display:flex}.b div{width:8px;height:8px;background:#eee}" }],
]) {
  console.log(`\n${"=".repeat(72)}\n${label}\n${"=".repeat(72)}`);
  console.log(await call("preview_view", args));
}

console.log(`\n${"=".repeat(72)}\nlive table: open_environment + start_match + inspect_view\n${"=".repeat(72)}`);
console.log(await call("open_environment", { id: c4 }));
console.log("\n--- start_match ---");
console.log(await call("start_match", { environment_id: c4, agent_label: "smoke" }));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "live-table.png") });
console.log("\n--- inspect_view ---");
console.log(await call("inspect_view", {}));

// Layout faults a person spots instantly and a projection has to say out loud,
// each paired with the same table built correctly so the check cannot pass by
// simply complaining about everything.
console.log(`\n${"=".repeat(72)}\nwhat the report catches\n${"=".repeat(72)}`);
let failures = 0;
const card = (extra = "") =>
  `<div class="board"><div class="hand">${"<div class='c'>x</div>".repeat(8)}</div>` +
  `<div class="them"${extra}><div class="card">Charizard 100 HP</div></div>` +
  `<button data-action="attack" aria-label="Attack">Attack</button></div>`;
const base = `.board{width:300px;background:#222;padding:8px;color:#fff}.c{width:70px;height:60px;background:#444}
.card{background:#333;padding:8px;width:120px}button{height:34px;background:#4a4;color:#000}`;

for (const [what, args, expected] of [
  [
    "text rotated to face the other player",
    { html: card(), css: `${base}.hand{display:flex;gap:6px}.them{transform:rotate(180deg)}` },
    /upside down/,
  ],
  [
    "a row wider than the box it sits in",
    { html: card(), css: `${base}.hand{display:flex;gap:6px;width:640px}` },
    /sticks out/,
  ],
  [
    "the same table, upright and contained",
    { html: card(), css: `${base}.hand{display:flex;gap:6px;flex-wrap:wrap}` },
    null,
  ],
]) {
  const out = await call("preview_view", args);
  const flagged = expected ? expected.test(out) : /^ok: true/.test(out);
  if (!flagged) failures++;
  console.log(`${flagged ? "ok  " : "FAIL"} ${what}`);
  if (!flagged) console.log(out.split("\n").slice(0, 12).join("\n"));
}

await browser.close();
await forget([c4, ttt, kuhn]);
console.log(failures ? `\n${failures} failed` : "\nthe report says what a person would say");
process.exit(failures ? 1 : 0);
