#!/usr/bin/env node
/**
 * Drive the same HTTP surface the page tools use, through Gemini on Vertex AI.
 * Usage: node scripts/agent-loop.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const PROJECT = "your-project-id";
const LOCATION = "us-central1";
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash-001",
  "gemini-1.5-pro-002",
];

const TOOLS = [
  {
    name: "get_authoring_guide",
    description: "Contract, UI vocabulary, determinism rules, Tic-Tac-Toe example.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "list_environments",
    description: "List environments.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "get_environment",
    description: "Get one environment. Optional fn to fetch a single function.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        fn: { type: "STRING" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_environment",
    description: "Create a draft. code may be partial. Validation runs immediately.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        description: { type: "STRING" },
        players: { type: "INTEGER" },
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
    name: "fork_environment",
    description: "Copy a validated environment as a draft.",
    parameters: {
      type: "OBJECT",
      properties: {
        source_id: { type: "STRING" },
        name: { type: "STRING" },
      },
      required: ["source_id", "name"],
    },
  },
  {
    name: "update_environment",
    description: "Patch functions. Requires expected_revision.",
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
    description: "Run V0–V6. Failures are repair instructions.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        episodes: { type: "INTEGER" },
      },
      required: ["id"],
    },
  },
  {
    name: "describe_dataset",
    description: "Trajectory schema and a sample row.",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" } },
      required: ["id"],
    },
  },
  {
    name: "publish_environment",
    description: "Publish if validation passed.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        expected_revision: { type: "INTEGER" },
      },
      required: ["id", "expected_revision"],
    },
  },
  {
    name: "start_match",
    description: "Start a match on an environment.",
    parameters: {
      type: "OBJECT",
      properties: { environment_id: { type: "STRING" } },
      required: ["environment_id"],
    },
  },
  {
    name: "take_action",
    description: "Play one legal action.",
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
    description: "Export recorded trajectories.",
    parameters: {
      type: "OBJECT",
      properties: {
        environment_id: { type: "STRING" },
        match_id: { type: "STRING" },
      },
    },
  },
];

async function execTool(name, args) {
  const a = args || {};
  const routes = {
    get_authoring_guide: () => fetchJson(`${BASE}/api/guide`),
    list_environments: () => fetchJson(`${BASE}/api/environments`),
    get_environment: () =>
      fetchJson(`${BASE}/api/environments/${a.id}${a.fn ? `?fn=${a.fn}` : ""}`),
    create_environment: () =>
      fetchJson(`${BASE}/api/environments`, { method: "POST", body: JSON.stringify(a) }),
    fork_environment: () =>
      fetchJson(`${BASE}/api/environments/${a.source_id}/fork`, {
        method: "POST",
        body: JSON.stringify({ name: a.name }),
      }),
    update_environment: () =>
      fetchJson(`${BASE}/api/environments/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expected_revision: a.expected_revision,
          code: a.code,
        }),
      }),
    validate_environment: () =>
      fetchJson(`${BASE}/api/environments/${a.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ episodes: a.episodes }),
      }),
    describe_dataset: () => fetchJson(`${BASE}/api/environments/${a.id}/dataset`),
    publish_environment: () =>
      fetchJson(`${BASE}/api/environments/${a.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ expected_revision: a.expected_revision }),
      }),
    start_match: () =>
      fetchJson(`${BASE}/api/matches`, { method: "POST", body: JSON.stringify(a) }),
    take_action: () =>
      fetchJson(`${BASE}/api/matches/${a.match_id}/action`, {
        method: "POST",
        body: JSON.stringify({
          action: a.action,
          expected_revision: a.expected_revision,
        }),
      }),
    export_episodes: () => {
      const q = new URLSearchParams();
      if (a.environment_id) q.set("environment_id", a.environment_id);
      if (a.match_id) q.set("match_id", a.match_id);
      return fetchJson(`${BASE}/api/episodes?${q}`);
    },
  };
  if (!routes[name]) return { error: `unknown tool ${name}` };
  return routes[name]();
}

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text, status: res.status };
  }
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

async function generate(model, contents) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body?.error?.message || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const SYSTEM = `You are authoring an RL environment on Arena.
Task: design Connect Four (6x7, four-in-a-row, gravity) as five pure JS functions, validate it, show the dataset shape, start a match, play one move, export the episode.

Rules:
- Call get_authoring_guide first, or fork env_connect_four / env_tictactoe.
- Prefer fork_environment from env_connect_four if you only need to confirm the pipeline; if you author from scratch, follow the guide exactly.
- After create/update, read validation.failures and fix with update_environment.
- state.to_move is required. Throw on illegal actions.
- Do not use Math.random or Date.
- When validation.ok, call describe_dataset, publish_environment, start_match, take_action, export_episodes.
- Stop when you have exported at least one step.`;

async function main() {
  console.log("base", BASE);
  let model = MODELS[0];
  const contents = [
    { role: "user", parts: [{ text: SYSTEM }] },
  ];
  let lastEnv = null;
  let published = false;
  let exported = false;

  for (let turn = 1; turn <= 18; turn++) {
    console.log(`\n======== turn ${turn} model=${model} ========`);
    let data;
    try {
      data = await generate(model, contents);
    } catch (e) {
      console.log("model error:", e.message);
      const idx = MODELS.indexOf(model);
      if (idx < MODELS.length - 1) {
        model = MODELS[idx + 1];
        console.log("falling back to", model);
        turn -= 1;
        continue;
      }
      throw e;
    }
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
    const calls = parts.filter((p) => p.functionCall);
    if (text) console.log("model:", text.slice(0, 800));
    if (!calls.length) {
      console.log("no tool calls — stopping");
      break;
    }
    contents.push({ role: "model", parts });
    const fnParts = [];
    for (const c of calls) {
      const name = c.functionCall.name;
      const args = c.functionCall.args || {};
      console.log("→", name, clip(args, 400));
      const result = await execTool(name, args);
      console.log("←", clip(result, 900));
      if (result?.environment?.id) lastEnv = result.environment;
      if (result?.environment?.published) published = true;
      if (result?.validation?.ok) console.log("  validation OK");
      if (result?.records || result?.jsonl) exported = true;
      fnParts.push({
        functionResponse: {
          name,
          response: { result: clip(result, 8000) },
        },
      });
    }
    contents.push({ role: "user", parts: fnParts });
    if (published && exported) {
      console.log("\nSUCCESS: published and exported");
      break;
    }
  }
  console.log("\nsummary", { lastEnv: lastEnv?.id, published, exported });
  if (!exported) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
