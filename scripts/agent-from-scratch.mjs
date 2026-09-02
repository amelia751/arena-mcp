#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { previewHtml } from "./view-playwright.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:3001";
const PROJECT = "your-project-id";
const LOCATION = "us-central1";
const MODEL = "gemini-2.5-pro";
const LOG = path.join(process.cwd(), ".data", "agent-from-scratch.jsonl");

mkdirSync(path.dirname(LOG), { recursive: true });

function log(row) {
  appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...row }) + "\n");
}

const TOOLS = [
  { name: "get_authoring_guide", parameters: { type: "OBJECT", properties: {} } },
  { name: "list_environments", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "get_environment",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" }, fn: { type: "STRING" } },
      required: ["id"],
    },
  },
  {
    name: "create_environment",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        description: { type: "STRING" },
        code: {
          type: "OBJECT",
          properties: {
            init: { type: "STRING" },
            legal_actions: { type: "STRING" },
            observe: { type: "STRING" },
            step: { type: "STRING" },
            render: { type: "STRING" },
          },
        },
      },
      required: ["name"],
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
            init: { type: "STRING" },
            legal_actions: { type: "STRING" },
            observe: { type: "STRING" },
            step: { type: "STRING" },
            render: { type: "STRING" },
          },
        },
      },
      required: ["id", "expected_revision"],
    },
  },
  {
    name: "validate_environment",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" } },
      required: ["id"],
    },
  },
  {
    name: "preview_view",
    parameters: {
      type: "OBJECT",
      properties: {
        html: { type: "STRING" },
        css: { type: "STRING" },
        environment_id: { type: "STRING" },
        seed: { type: "INTEGER" },
      },
    },
  },
  {
    name: "inspect_view",
    parameters: {
      type: "OBJECT",
      properties: { environment_id: { type: "STRING" } },
    },
  },
  {
    name: "describe_dataset",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" } },
      required: ["id"],
    },
  },
  {
    name: "publish_environment",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" }, expected_revision: { type: "INTEGER" } },
      required: ["id", "expected_revision"],
    },
  },
  {
    name: "start_match",
    parameters: {
      type: "OBJECT",
      properties: { environment_id: { type: "STRING" } },
      required: ["environment_id"],
    },
  },
  {
    name: "take_action",
    parameters: {
      type: "OBJECT",
      properties: {
        match_id: { type: "STRING" },
        action: { type: "STRING" },
        expected_revision: { type: "INTEGER" },
      },
      required: ["match_id", "action", "expected_revision"],
    },
  },
  {
    name: "export_episodes",
    parameters: {
      type: "OBJECT",
      properties: { match_id: { type: "STRING" }, environment_id: { type: "STRING" } },
    },
  },
];

let lastEnvId = null;

async function execTool(name, a = {}) {
  const map = {
    get_authoring_guide: () => get(`${BASE}/api/guide`),
    list_environments: () => get(`${BASE}/api/environments`),
    get_environment: () => get(`${BASE}/api/environments/${a.id}${a.fn ? `?fn=${a.fn}` : ""}`),
    create_environment: () => post(`${BASE}/api/environments`, a),
    update_environment: () =>
      patch(`${BASE}/api/environments/${a.id}`, {
        expected_revision: a.expected_revision,
        code: a.code,
      }),
    validate_environment: () => post(`${BASE}/api/environments/${a.id}/validate`, {}),
    describe_dataset: () => get(`${BASE}/api/environments/${a.id}/dataset`),
    publish_environment: () =>
      post(`${BASE}/api/environments/${a.id}/publish`, { expected_revision: a.expected_revision }),
    start_match: () => post(`${BASE}/api/matches`, a),
    take_action: () =>
      post(`${BASE}/api/matches/${a.match_id}/action`, {
        action: a.action,
        expected_revision: a.expected_revision,
      }),
    export_episodes: () => {
      const q = new URLSearchParams();
      if (a.match_id) q.set("match_id", a.match_id);
      if (a.environment_id) q.set("environment_id", a.environment_id);
      return get(`${BASE}/api/episodes?${q}`);
    },
    preview_view: async () => {
      let html = a.html || "";
      let css = a.css || "";
      let legal;
      if (a.environment_id && !html) {
        const q = new URLSearchParams();
        if (a.seed != null) q.set("seed", String(a.seed));
        const res = await get(`${BASE}/api/environments/${a.environment_id}/view?${q}`);
        if (res.error) return res;
        if (res.view) {
          html = res.view.html;
          css = res.view.css || "";
        }
        legal = res.legal_actions;
        if (!html) return res;
      }
      if (!html) return { error: "Pass html or environment_id" };
      const snap = await previewHtml(html, css, {
        screenshot: `preview-${Date.now()}.png`,
      });
      const missing = (legal || []).filter((id) => !snap.actions.includes(id));
      if (missing.length) snap.warnings.push(`legal actions with no data-action: ${missing.join(", ")}`);
      return { ...snap, legal_actions: legal ?? null };
    },
    inspect_view: async () => {
      const id = a.environment_id || lastEnvId;
      if (!id) return { error: "No environment_id. Pass one or start_match first." };
      const res = await get(`${BASE}/api/environments/${id}/view`);
      if (res.view?.html) {
        const snap = await previewHtml(res.view.html, res.view.css || "", {
          screenshot: `inspect-${id}.png`,
        });
        const missing = (res.legal_actions || []).filter((x) => !snap.actions.includes(x));
        if (missing.length) snap.warnings.push(`legal actions with no data-action: ${missing.join(", ")}`);
        return { ...snap, legal_actions: res.legal_actions ?? null, source: "render" };
      }
      return { error: "render did not return HTML to inspect" };
    },
  };
  if (!map[name]) return { error: `unknown tool ${name}` };
  return map[name]();
}

async function get(url) {
  const r = await fetch(url);
  return r.json();
}
async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function patch(url, body) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function token() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    env: process.env,
  }).trim();
}
function clip(v, n = 5000) {
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
      generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || res.statusText);
  return body;
}

const TASK = `Design Connect Four as a brand-new Arena environment. Do NOT fork env_connect_four or copy it via get_environment. You MAY call get_authoring_guide and read env_tictactoe as a pattern for the five functions — not for the Connect Four board look.

Requirements:
- 6 rows, 7 columns, gravity (fill from the bottom), win is four in a row
- actions col_0..col_6, state.to_move required, throw on illegal actions
- no Math.random or Date
- render MUST return { html, css }. A UI tree will fail V6.
- You write the HTML and CSS. Make it look like a physical felt table: dark green slab, circular holes, gold discs for seat 0, bone discs for seat 1, drop controls above columns with data-action="col_N".
- After you save render, call preview_view({ environment_id }). If warnings is non-empty, patch render and preview again. Do not publish until preview_view returns ok:true and warnings:[].
- Use <button aria-label="Column N">, wrap the table in width:max-content, show whose turn it is.
- After start_match, call inspect_view, take one action, export_episodes.

Write all five functions yourself with create_environment / update_environment. Fix validation failures. Then describe_dataset, publish, start_match, inspect_view, take one action, export_episodes. Stop only when exported AND the last preview_view/inspect_view had no warnings.`;

const contents = [{ role: "user", parts: [{ text: TASK }] }];
let exported = false;
let previewed = false;
let viewClean = false;
let lastFail = null;
let lastEnv = null;

console.log("base", BASE, "log", LOG);
log({ event: "start", base: BASE, model: MODEL });

for (let turn = 1; turn <= 20; turn++) {
  console.log(`\n======== scratch turn ${turn} ========`);
  const data = await generate(contents);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
  const calls = parts.filter((p) => p.functionCall);
  if (text) console.log("model:", text.slice(0, 800));
  log({ event: "model", turn, text: text.slice(0, 2000), calls: calls.map((c) => c.functionCall.name) });
  if (!calls.length) {
    console.log("no tool calls");
    log({ event: "stop", reason: "no_tool_calls", turn });
    break;
  }
  contents.push({ role: "model", parts });
  const fnParts = [];
  for (const c of calls) {
    const name = c.functionCall.name;
    const args = c.functionCall.args || {};
    if (
      (name === "get_environment" && String(args.id || "").includes("connect")) ||
      (name === "fork_environment" && String(args.source_id || "").includes("connect"))
    ) {
      console.log("→ blocked", name, "on connect four");
      log({ event: "blocked", name, args });
      fnParts.push({
        functionResponse: { name, response: { result: "blocked: write Connect Four and its HTML yourself" } },
      });
      continue;
    }
    console.log("→", name, clip(args, 400));
    const started = Date.now();
    let result;
    try {
      result = await execTool(name, args);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) };
      console.log("✗ tool threw", result.error);
    }
    const ms = Date.now() - started;
    console.log("←", name, `${ms}ms`, clip(result, 900));
    log({
      event: "tool",
      turn,
      name,
      ms,
      args: clip(args, 2000),
      result: clip(result, 4000),
      error: result?.error || null,
    });
    if (result?.environment?.id) {
      lastEnv = result.environment;
      lastEnvId = result.environment.id;
    }
    if (name === "create_environment" && result?.environment?.id) lastEnvId = result.environment.id;
    if (name === "preview_view" || name === "inspect_view") {
      previewed = true;
      viewClean = !result?.warnings?.length && result?.ok !== false;
      if (result?.actions) console.log("  view actions", result.actions);
      if (result?.warnings?.length) console.log("  view warnings", result.warnings);
      if (result?.screenshot) console.log("  screenshot", result.screenshot);
    }
    if (result?.validation?.failures?.length) lastFail = result.validation.failures;
    if (result?.environment?.validation?.failures?.length) {
      lastFail = result.environment.validation.failures;
    }
    if (result?.records || result?.jsonl) exported = true;
    fnParts.push({ functionResponse: { name, response: { result: clip(result, 8000) } } });
  }
  contents.push({ role: "user", parts: fnParts });
  if (exported && viewClean) {
    console.log("\nFROM-SCRATCH SUCCESS", { lastEnv: lastEnv?.id, previewed, viewClean });
    log({ event: "success", lastEnv: lastEnv?.id, previewed, viewClean });
    break;
  }
}

if (!exported) {
  console.log("\nFROM-SCRATCH FAILED lastFail=", lastFail, "lastEnv=", lastEnv?.id);
  log({ event: "fail", lastFail, lastEnv: lastEnv?.id });
  process.exit(2);
}
