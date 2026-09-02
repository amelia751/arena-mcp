// Can Playwright drive a real document.modelContext surface?
import { chromium } from "playwright";

const ARGS = [
  "--enable-experimental-web-platform-features",
  "--enable-features=WebMCPTesting,DevToolsWebMCPSupport",
];

for (const channel of [undefined, "chrome"]) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel, args: ARGS });
  } catch (e) {
    console.log(`${channel ?? "bundled"}: launch failed — ${e.message.split("\n")[0]}`);
    continue;
  }
  const page = await browser.newPage();
  await page.goto("http://localhost:3080/", { waitUntil: "networkidle" });
  const info = await page.evaluate(async () => ({
    isSecureContext,
    tools: document.modelContext ? (await document.modelContext.getTools()).map((t) => t.name) : null,
    testingTools: navigator.modelContextTesting
      ? (await navigator.modelContextTesting.listTools()).map((t) => t.name)
      : null,
    version: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0],
    doc: typeof document.modelContext,
    nav: typeof navigator.modelContext,
    testing: typeof navigator.modelContextTesting,
    docMethods: document.modelContext
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(document.modelContext))
      : null,
    testingMethods: navigator.modelContextTesting
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(navigator.modelContextTesting))
      : null,
  }));
  console.log(`${channel ?? "bundled"}:`, JSON.stringify(info, null, 2));
  await browser.close();
}
