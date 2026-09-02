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
body{display:flex;justify-content:center}
.preview-host{width:max-content;max-width:100%}
button{font:inherit;cursor:pointer}
${css || ""}
</style></head><body><div class="preview-host">${html || ""}</div></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const actions = await page.$$eval("[data-action]", (els) =>
      els.map((el) => el.getAttribute("data-action")).filter(Boolean),
    );
    const layout = await page.evaluate(() => {
      const hits = [...document.querySelectorAll("[data-action]")];
      const cells = [...document.querySelectorAll(".cell, .board > *")];
      const board = document.querySelector(".board");
      const warnings = [];
      if (hits.some((el) => el.tagName !== "BUTTON")) {
        warnings.push("data-action nodes should be <button> with aria-label, not bare divs");
      }
      if (hits.some((el) => !el.getAttribute("aria-label"))) {
        warnings.push("clickable controls have no aria-label");
      }
      if (board && cells.length >= 8) {
        const bb = board.getBoundingClientRect();
        const last = cells[cells.length - 1].getBoundingClientRect();
        const slack = bb.right - last.right;
        if (slack > 80) {
          warnings.push(
            `board is ${Math.round(slack)}px wider than its grid — wrap the table in width:max-content so drop controls line up with columns`,
          );
        }
      }
      if (hits.length >= 2 && cells.length >= 8) {
        const a0 = hits[0].getBoundingClientRect();
        const a1 = hits[1].getBoundingClientRect();
        const c0 = cells[0].getBoundingClientRect();
        const c1 = cells[1].getBoundingClientRect();
        const drift = Math.abs(a0.left + a0.width / 2 - (c0.left + c0.width / 2));
        const stepA = a1.left - a0.left;
        const stepC = c1.left - c0.left;
        if (drift > 16 || (stepC > 10 && Math.abs(stepA - stepC) > 16)) {
          warnings.push("drop controls do not line up with board columns");
        }
      }
      return warnings;
    });
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
    const warnings = [];
    if (!actions.length) warnings.push("no data-action nodes painted");
    warnings.push(...layout);
    return {
      ok: warnings.length === 0,
      snapshot,
      actions,
      size: box
        ? { width: Math.round(box.width), height: Math.round(box.height) }
        : { width: 0, height: 0 },
      screenshot: shot,
      warnings,
    };
  } finally {
    await browser.close();
  }
}
