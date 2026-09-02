/**
 * Mount authored HTML/CSS in Chromium and return an accessibility snapshot.
 * Used by the Vertex agent loop the same way preview_view / inspect_view work on the page.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), ".data", "previews");

export async function previewHtml(html, css = "", opts = {}) {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:16px;background:#f4efe6;color:#1c1814;font-family:ui-sans-serif,system-ui,sans-serif}
button{font:inherit;cursor:pointer}
${css || ""}
</style></head><body>${html || ""}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const actions = await page.$$eval("[data-action]", (els) =>
      els.map((el) => el.getAttribute("data-action")).filter(Boolean),
    );
    let snapshot = "";
    try {
      snapshot = await page.locator("body").ariaSnapshot();
    } catch {
      snapshot = await page.locator("body").innerText();
    }
    const shot = opts.screenshot
      ? path.join(OUT, opts.screenshot)
      : path.join(OUT, `view-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const box = await page.locator("body").boundingBox();
    return {
      ok: true,
      snapshot,
      actions,
      size: box
        ? { width: Math.round(box.width), height: Math.round(box.height) }
        : { width: 0, height: 0 },
      screenshot: shot,
      warnings: actions.length ? [] : ["no data-action nodes painted"],
    };
  } finally {
    await browser.close();
  }
}

export async function inspectLive(base, environmentId) {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.goto(`${base}/e/${environmentId}`, { waitUntil: "networkidle", timeout: 20000 });
    const sit = page.getByRole("button", { name: /sit down/i });
    if (await sit.count()) {
      await sit.click({ timeout: 8000 }).catch(() => {});
      await page.getByRole("button", { name: /deal again/i }).waitFor({ timeout: 4000 }).catch(() => {});
    }
    await page.locator("[data-action]").first().waitFor({ timeout: 3000 }).catch(() => {});
    let snapshot = "";
    try {
      snapshot = await page.locator("body").ariaSnapshot();
    } catch {
      snapshot = await page.locator("body").innerText();
    }
    const actions = await page
      .locator("[data-action]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-action")).filter(Boolean));
    const shot = path.join(OUT, `live-${environmentId}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    return { ok: true, snapshot, actions, screenshot: shot };
  } finally {
    await browser.close();
  }
}
