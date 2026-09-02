"use client";

import { useEffect } from "react";

const GUIDE =
  "Return the five-function contract, UI node vocabulary, determinism rules, and a complete Tic-Tac-Toe example. Call this before writing any code.";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText, status: res.status };
  }
}

function clip(value: unknown, max = 1800): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= max) return s;
  return s.slice(0, max - 24) + "… [truncated — request a narrower field]";
}

function ctx() {
  return document.modelContext ?? navigator.modelContext;
}

export function ArenaTools() {
  useEffect(() => {
    const model = ctx();
    if (!model?.registerTool) return;
    const controller = new AbortController();
    const { signal } = controller;

    const tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: Record<string, unknown>) => Promise<string>;
    }> = [
      {
        name: "get_authoring_guide",
        description: GUIDE,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => clip(await api("/api/guide"), 8000),
      },
      {
        name: "list_environments",
        description: "List environments with id, name, players, and validation status.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => clip(await api("/api/environments")),
      },
      {
        name: "get_environment",
        description:
          "Get one environment. Pass fn to fetch a single function body (init, legal_actions, observe, step, render).",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            fn: {
              type: "string",
              enum: ["init", "legal_actions", "observe", "step", "render"],
            },
          },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async ({ id, fn }) => {
          const q = fn ? `?fn=${encodeURIComponent(String(fn))}` : "";
          return clip(await api(`/api/environments/${id}${q}`), 4000);
        },
      },
      {
        name: "create_environment",
        description:
          "Create an environment. code may be partial — send the functions you have. Validation runs automatically.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            players: { type: "integer" },
            code: {
              type: "object",
              properties: {
                init: { type: "string" },
                legal_actions: { type: "string" },
                observe: { type: "string" },
                step: { type: "string" },
                render: { type: "string" },
              },
            },
          },
          required: ["name"],
          additionalProperties: false,
        },
        execute: async (input) =>
          clip(
            await api("/api/environments", {
              method: "POST",
              body: JSON.stringify(input),
            }),
            3500,
          ),
      },
      {
        name: "fork_environment",
        description:
          "Copy a validated environment as a draft. Prefer this over writing Connect Four from a blank page — fork env_tictactoe or env_connect_four.",
        inputSchema: {
          type: "object",
          properties: {
            source_id: { type: "string" },
            name: { type: "string" },
          },
          required: ["source_id", "name"],
          additionalProperties: false,
        },
        execute: async ({ source_id, name }) =>
          clip(
            await api(`/api/environments/${source_id}/fork`, {
              method: "POST",
              body: JSON.stringify({ name }),
            }),
            2500,
          ),
      },
      {
        name: "update_environment",
        description:
          "Patch one or more functions. Requires expected_revision from the last create/update. Published environments cannot be edited — fork first.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            expected_revision: { type: "integer" },
            name: { type: "string" },
            description: { type: "string" },
            code: {
              type: "object",
              properties: {
                init: { type: "string" },
                legal_actions: { type: "string" },
                observe: { type: "string" },
                step: { type: "string" },
                render: { type: "string" },
              },
            },
          },
          required: ["id", "expected_revision"],
          additionalProperties: false,
        },
        execute: async ({ id, ...rest }) =>
          clip(
            await api(`/api/environments/${id}`, {
              method: "PATCH",
              body: JSON.stringify(rest),
            }),
            3500,
          ),
      },
      {
        name: "validate_environment",
        description:
          "Run V0–V6 plus random playouts. Failures are written as repair instructions. Call this after every edit.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            episodes: { type: "integer", description: "Playout count. Default 300." },
          },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async ({ id, episodes }) =>
          clip(
            await api(`/api/environments/${id}/validate`, {
              method: "POST",
              body: JSON.stringify({ episodes }),
            }),
            3500,
          ),
      },
      {
        name: "describe_dataset",
        description:
          "Trajectory schema specialised to this environment, plus one real sample row from a playout.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async ({ id }) => clip(await api(`/api/environments/${id}/dataset`), 2500),
      },
      {
        name: "publish_environment",
        description:
          "Publish only if V0–V6 pass. Mints a shareable /e/{id} URL. Requires expected_revision.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            expected_revision: { type: "integer" },
            confirm_info_flow: { type: "boolean" },
          },
          required: ["id", "expected_revision"],
          additionalProperties: false,
        },
        execute: async ({ id, ...rest }) =>
          clip(
            await api(`/api/environments/${id}/publish`, {
              method: "POST",
              body: JSON.stringify(rest),
            }),
          ),
      },
      {
        name: "start_match",
        description: "Start a match. Human is seat 0 in the UI; you are seat 1 unless you pass seat.",
        inputSchema: {
          type: "object",
          properties: {
            environment_id: { type: "string" },
            seat: { type: "integer" },
            agent_label: { type: "string" },
          },
          required: ["environment_id"],
          additionalProperties: false,
        },
        execute: async (input) =>
          clip(
            await api("/api/matches", { method: "POST", body: JSON.stringify(input) }),
          ),
      },
      {
        name: "get_observation",
        description: "Your seat's observation, legal actions, revision, and phase.",
        inputSchema: {
          type: "object",
          properties: {
            match_id: { type: "string" },
            seat: { type: "integer" },
          },
          required: ["match_id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async ({ match_id, seat }) => {
          const q = seat != null ? `?seat=${seat}` : "";
          return clip(await api(`/api/matches/${match_id}/observation${q}`));
        },
      },
      {
        name: "take_action",
        description:
          "Play one legal action. Requires expected_revision. Optional rationale and 1–5 confidence are stored on the trajectory.",
        inputSchema: {
          type: "object",
          properties: {
            match_id: { type: "string" },
            action: { type: "string" },
            expected_revision: { type: "integer" },
            rationale: { type: "string" },
            confidence: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: ["match_id", "action", "expected_revision"],
          additionalProperties: false,
        },
        execute: async ({ match_id, ...rest }) =>
          clip(
            await api(`/api/matches/${match_id}/action`, {
              method: "POST",
              body: JSON.stringify({ ...rest, interface: "webmcp" }),
            }),
          ),
      },
      {
        name: "wait_for_turn",
        description:
          "Wait up to 8 seconds for the match revision to advance. Returns still_waiting if nothing changed.",
        inputSchema: {
          type: "object",
          properties: {
            match_id: { type: "string" },
            after_revision: { type: "integer" },
            timeout_ms: { type: "integer" },
          },
          required: ["match_id", "after_revision"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async ({ match_id, after_revision, timeout_ms }) => {
          const q = new URLSearchParams({
            after_revision: String(after_revision),
          });
          if (timeout_ms != null) q.set("timeout_ms", String(timeout_ms));
          return clip(await api(`/api/matches/${match_id}/wait?${q}`));
        },
      },
      {
        name: "export_episodes",
        description: "Download recorded trajectories as JSONL for the given environment or match.",
        inputSchema: {
          type: "object",
          properties: {
            environment_id: { type: "string" },
            match_id: { type: "string" },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          const q = new URLSearchParams();
          if (input.environment_id) q.set("environment_id", String(input.environment_id));
          if (input.match_id) q.set("match_id", String(input.match_id));
          return clip(await api(`/api/episodes?${q}`), 4000);
        },
      },
    ];

    for (const tool of tools) {
      model
        .registerTool(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            execute: async (input) => {
              try {
                return await tool.execute(input ?? {});
              } catch (e) {
                return JSON.stringify({
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            },
          },
          { signal },
        )
        .catch(() => {
          // Strict Mode remounts; a duplicate name is expected and ignored.
        });
    }

    return () => controller.abort();
  }, []);

  return null;
}
