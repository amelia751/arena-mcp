// A tool that writes must leave the person's page showing the result, with no reload.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const STORE = new URL("../.data/store.json", import.meta.url);

/** The probe authors real drafts; against a local store it takes them back out again. */
async function forget(ids) {
  try {
    const store = JSON.parse(await readFile(STORE, "utf8"));
    for (const id of ids) delete store.environments?.[id];
    await writeFile(STORE, JSON.stringify(store, null, 2));
  } catch {
    /* not running against a local store */
  }
}

const BASE = process.argv[2] || process.env.ARENA_BASE || "http://localhost:3000";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-experimental-web-platform-features",
    "--enable-features=WebMCPTesting,DevToolsWebMCPSupport",
  ],
});
const page = await browser.newPage();

const call = (name, args = {}) =>
  page.evaluate(
    async ([toolName, payload]) => {
      const ctx = document.modelContext;
      const tools = await ctx.getTools();
      const tool = tools.find((t) => t.name === toolName);
      if (!tool) throw new Error(`no tool named ${toolName}`);
      return ctx.executeTool(tool, JSON.stringify(payload));
    },
    [name, args],
  );

// What the human can read off the page right now, without touching the browser.
const onScreen = () => page.locator("main .game-card").allInnerTexts();

const failures = [];
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures.push(label);
};

await page.goto(BASE, { waitUntil: "networkidle" });

const before = await onScreen();
console.log("before:", JSON.stringify(before));

const name = `Refresh Probe ${Date.now()}`;
await call("create_environment", { name, players: 2 });

const after = await onScreen();
console.log("after: ", JSON.stringify(after));
check("create_environment shows up with no reload", after.join("\n").includes(name));

// The link is server-rendered, so the id being on screen is itself the proof.
const href = await page
  .locator(".game-card", { hasText: name })
  .locator("a", { hasText: "Play" })
  .getAttribute("href");
const id = href?.split("/").pop();
check("the new draft is linked on the page", Boolean(id), href ?? "no link");

// The status badge is server-rendered too, so a rename has to repaint the same way.
const renamed = `${name} renamed`;
await call("update_environment", { id, expected_revision: 1, name: renamed });
const touched = (await onScreen()).join("\n");
check("update_environment repaints without a reload", touched.includes(renamed), touched);

// A reload must not reveal anything the page was not already showing.
const beforeReload = (await onScreen()).join("\n");
await page.reload({ waitUntil: "networkidle" });
const afterReload = (await onScreen()).join("\n");
check("a manual reload adds nothing new", beforeReload === afterReload);

// The same has to hold on the environment's own page, whose heading and revision
// line are server-rendered from the record the agent is editing.
await call("open_environment", { id });
const heading = () => page.locator(".env-banner h1, .env-banner .banner-meta").allInnerTexts();
console.log("on env page:", JSON.stringify(await heading()));

await call("update_environment", {
  id,
  expected_revision: 2,
  description: "edited while the person was looking at it",
});
const edited = (await heading()).join("\n");
check("the env page tracks an edit without a reload", edited.includes("rev 3"), edited);

await forget([id]);

await browser.close();
console.log(failures.length ? `\nFAILED: ${failures.join(", ")}` : "\nall good");
process.exit(failures.length ? 1 : 0);
