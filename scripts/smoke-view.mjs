#!/usr/bin/env node
/** Calls the real preview_view / inspect_view tools and prints what they answer. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3080";
const OUT = path.join(process.cwd(), ".data", "smoke");
mkdirSync(OUT, { recursive: true });

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
  ["connect four, empty", { environment_id: "env_connect_four" }],
  ["connect four, mid-game", { environment_id: "env_connect_four", moves: ["col_3", "col_4", "col_3", "col_2"] }],
  ["tic tac toe, mid-game", { environment_id: "env_tictactoe", moves: ["cell_4", "cell_0", "cell_8"] }],
  ["kuhn poker", { environment_id: "env_kuhn" }],
  ["a bad draft", { html: "<div class='b'><div data-action='col_0'></div><div data-action='col_1'></div></div>", css: ".b{display:flex}.b div{width:8px;height:8px;background:#eee}" }],
]) {
  console.log(`\n${"=".repeat(72)}\n${label}\n${"=".repeat(72)}`);
  console.log(await call("preview_view", args));
}

console.log(`\n${"=".repeat(72)}\nlive table: open_environment + start_match + inspect_view\n${"=".repeat(72)}`);
console.log(await call("open_environment", { id: "env_connect_four" }));
console.log("\n--- start_match ---");
console.log(await call("start_match", { environment_id: "env_connect_four", agent_label: "smoke" }));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "live-table.png") });
console.log("\n--- inspect_view ---");
console.log(await call("inspect_view", {}));

await browser.close();
