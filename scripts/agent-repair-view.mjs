#!/usr/bin/env node
/**
 * Fork a published env and have the model patch render (and step if needed)
 * until preview_view returns no warnings.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { previewHtml } from "./view-playwright.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:3001";
const SOURCE = process.argv[3] || "env_408c1fc4";
const PROJECT = "your-project-id";
const LOCATION = "us-central1";
const MODEL = "gemini-2.5-pro";
const LOG = path.join(process.cwd(), ".data", "agent-repair-view.jsonl");
mkdirSync(path.dirname(LOG), { recursive: true });
const log = (row) => appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...row }) + "\n");

const TOOLS = [
  {
    name: "get_environment",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" }, fn: { type: "STRING" } },
      required: ["id"],
    },
  },
  {
    name: "update_environment",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        expected_revision: { type: "INTEGER" },
        code: {
          type: "OBJECT",
          properties: {
            step: { type: "STRING" },
            render: { type: "STRING" },
          },
        },
      },
      required: ["id", "expected_revision"],
    },
  },
  {
    name: "preview_view",
    parameters: {
      type: "OBJECT",
      properties: { environment_id: { type: "STRING" }, html: { type: "STRING" }, css: { type: "STRING" } },
    },
  },
  {
    name: "validate_environment",
    parameters: { type: "OBJECT", properties: { id: { type: "STRING" } }, required: ["id"] },
  },
];

async function get(url) {
  return (await fetch(url)).json();
}
async function post(url, body) {
  return (
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
}
async function patch(url, body) {
  return (
    await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
}

async function execTool(name, a = {}) {
  if (name === "get_environment") {
    return get(`${BASE}/api/environments/${a.id}${a.fn ? `?fn=${a.fn}` : ""}`);
  }
  if (name === "update_environment") {
    return patch(`${BASE}/api/environments/${a.id}`, {
      expected_revision: a.expected_revision,
      code: a.code,
    });
  }
  if (name === "validate_environment") {
    return post(`${BASE}/api/environments/${a.id}/validate`, {});
  }
  if (name === "preview_view") {
    let html = a.html || "";
    let css = a.css || "";
    let legal;
    if (a.environment_id && !html) {
      const res = await get(`${BASE}/api/environments/${a.environment_id}/view`);
      if (res.error) return res;
      html = res.view?.html || "";
      css = res.view?.css || "";
      legal = res.legal_actions;
    }
    if (!html) return { error: "Pass html or environment_id" };
    const snap = await previewHtml(html, css, { screenshot: `repair-${Date.now()}.png` });
    const missing = (legal || []).filter((id) => !snap.actions.includes(id));
    if (missing.length) snap.warnings.push(`legal actions with no data-action: ${missing.join(", ")}`);
    snap.ok = snap.warnings.length === 0;
    return { ...snap, legal_actions: legal ?? null };
  }
  return { error: `unknown tool ${name}` };
}

function token() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    env: process.env,
  }).trim();
}
function clip(v, n = 6000) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length <= n ? s : s.slice(0, n) + "…";
}

async function generate(contents) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || res.statusText);
  return body;
}

const fork = await post(`${BASE}/api/environments/${SOURCE}/fork`, {
  name: "Connect Four — repaired table",
});
if (fork.error) {
  console.error("fork failed", fork);
  process.exit(1);
}
const envId = fork.environment.id;
const rev = fork.environment.revision;
const first = await execTool("preview_view", { environment_id: envId });
console.log("forked", envId, "rev", rev);
console.log("starting warnings", first.warnings);

const TASK = `You authored this Connect Four. The game logic is mostly fine. The table is not.

Environment id: ${envId}
Current revision: ${rev}

preview_view just returned:
${JSON.stringify({ ok: first.ok, warnings: first.warnings, snapshot: first.snapshot, actions: first.actions }, null, 2)}

Fix it yourself:
1. get_environment ${envId} fn=render (and fn=step).
2. Rewrite render so preview_view({ environment_id: "${envId}" }) returns ok:true and warnings:[].
   Required: <button aria-label="Column N" data-action="col_N">, wrap controls+board in width:max-content,
   drop targets lined up with columns, whose-turn text, felt green / gold / bone discs.
3. In step, reject col outside 0..6 as illegal (not "column is full").
4. After each update_environment, call preview_view again. Repeat until warnings is empty, then validate_environment.

Do not copy env_connect_four. Write the HTML/CSS yourself.`;

const contents = [{ role: "user", parts: [{ text: TASK }] }];
let clean = false;
let lastRev = rev;

console.log("log", LOG);
log({ event: "start", envId, warnings: first.warnings });

for (let turn = 1; turn <= 12; turn++) {
  console.log(`\n======== repair turn ${turn} ========`);
  const data = await generate(contents);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
  const calls = parts.filter((p) => p.functionCall);
  if (text) console.log("model:", text.slice(0, 700));
  log({ event: "model", turn, text: text.slice(0, 1500), calls: calls.map((c) => c.functionCall.name) });
  if (!calls.length) {
    console.log("no tool calls");
    break;
  }
  contents.push({ role: "model", parts });
  const fnParts = [];
  for (const c of calls) {
    const name = c.functionCall.name;
    const args = c.functionCall.args || {};
    console.log("→", name, clip(args, 350));
    const result = await execTool(name, args);
    console.log("←", clip(result, 800));
    if (result?.environment?.revision) lastRev = result.environment.revision;
    if (name === "preview_view") {
      console.log("  warnings", result.warnings, "ok", result.ok);
      if (result.ok && !result.warnings?.length) clean = true;
    }
    if (result?.validation?.ok && clean) {
      console.log("  validation ok and view clean");
    }
    log({ event: "tool", turn, name, result: clip(result, 3000) });
    fnParts.push({ functionResponse: { name, response: { result: clip(result, 8000) } } });
  }
  contents.push({ role: "user", parts: fnParts });
  if (clean) {
    const v = await execTool("validate_environment", { id: envId });
    console.log("final validate", v?.validation?.ok, v?.validation?.failures);
    if (v?.validation?.ok) {
      console.log("\nREPAIR SUCCESS", envId);
      log({ event: "success", envId, lastRev });
      process.exit(0);
    }
  }
}

console.log("\nREPAIR FAILED", envId, "clean", clean);
log({ event: "fail", envId, clean });
process.exit(2);
