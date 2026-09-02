#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] || "http://127.0.0.1:3001";
const PROJECT = "your-project-id";
const LOCATION = "us-central1";
const MODEL = "gemini-2.5-pro";

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

async function execTool(name, a = {}) {
  const map = {
    get_authoring_guide: () => get(`${BASE}/api/guide`),
    list_environments: () => get(`${BASE}/api/environments`),
    get_environment: () => get(`${BASE}/api/environments/${a.id}${a.fn ? `?fn=${a.fn}` : ""}`),
    create_environment: () => post(`${BASE}/api/environments`, a),
    update_environment: () =>
      patch(`${BASE}/api/environments/${a.id}`, { expected_revision: a.expected_revision, code: a.code }),
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
  };
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
  return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
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

const TASK = `Design Connect Four as a brand-new Arena environment. Do NOT fork env_connect_four or copy it via get_environment. You MAY call get_authoring_guide and read env_tictactoe as a pattern.

Requirements: 6 rows, 7 columns, gravity (fill from the bottom), win is four in a row, actions col_0..col_6, state.to_move required, throw on illegal actions, no Math.random or Date.

Write all five functions yourself with create_environment / update_environment. Fix validation failures. Then describe_dataset, publish, start_match, take one action, export_episodes. Stop when exported.`;

const contents = [{ role: "user", parts: [{ text: TASK }] }];
let ok = false;
let lastFail = null;

for (let turn = 1; turn <= 16; turn++) {
  console.log(`\n======== scratch turn ${turn} ========`);
  const data = await generate(contents);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
  const calls = parts.filter((p) => p.functionCall);
  if (text) console.log("model:", text.slice(0, 600));
  if (!calls.length) {
    console.log("no tool calls");
    break;
  }
  contents.push({ role: "model", parts });
  const fnParts = [];
  for (const c of calls) {
    const name = c.functionCall.name;
    const args = c.functionCall.args || {};
    if (name === "get_environment" && String(args.id || "").includes("connect")) {
      console.log("→ blocked get_environment on connect four");
      fnParts.push({
        functionResponse: { name, response: { result: "blocked: write Connect Four yourself" } },
      });
      continue;
    }
    console.log("→", name, clip(args, 350));
    const result = await execTool(name, args);
    console.log("←", clip(result, 700));
    if (result?.validation?.failures?.length) lastFail = result.validation.failures;
    if (result?.environment?.validation?.failures?.length) {
      lastFail = result.environment.validation.failures;
    }
    if (result?.records || result?.jsonl) ok = true;
    fnParts.push({ functionResponse: { name, response: { result: clip(result, 8000) } } });
  }
  contents.push({ role: "user", parts: fnParts });
  if (ok) {
    console.log("\nFROM-SCRATCH SUCCESS");
    break;
  }
}

if (!ok) {
  console.log("\nFROM-SCRATCH FAILED lastFail=", lastFail);
  process.exit(2);
}
