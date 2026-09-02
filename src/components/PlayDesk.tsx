"use client";

import { useEffect, useState } from "react";
import { GameView } from "./GameView";
import { UiTree } from "./UiTree";
import type { UINode } from "@/lib/ui-tree";
import type { AuthoredView } from "@/lib/view";

type MatchView = {
  match: {
    id: string;
    revision: number;
    to_move: number;
    terminal: boolean;
    rewards: number[];
    environment_name: string;
  };
  observation?: {
    observation: unknown;
    legal_actions: string[];
    ui?: UINode;
    view?: AuthoredView;
    seat: number;
    revision: number;
  };
  steps?: Array<{
    index: number;
    seat: number;
    action: string;
    reward: number;
    terminal: boolean;
    legal_actions: string[];
    latency_ms: number;
  }>;
};

export function PlayDesk({
  environmentId,
  humanSeat = 0,
}: {
  environmentId: string;
  humanSeat?: number;
}) {
  const [view, setView] = useState<MatchView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clickedAt, setClickedAt] = useState<number | null>(null);

  async function refresh(matchId: string) {
    const res = await fetch(`/api/matches/${matchId}`).then((r) => r.json());
    const obs = await fetch(
      `/api/matches/${matchId}/observation?seat=${humanSeat}`,
    ).then((r) => r.json());
    setView({ match: res.match, steps: res.steps, observation: obs });
  }

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ environment_id: environmentId, seat: humanSeat }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView({ match: res.match, observation: res.observation, steps: [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: string) {
    if (!view) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/matches/${view.match.id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          expected_revision: view.match.revision,
          interface: "human_ui",
          latency_ms: clickedAt ? Date.now() - clickedAt : undefined,
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      await refresh(view.match.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setClickedAt(null);
    }
  }

  async function bot() {
    if (!view) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/matches/${view.match.id}/bot`, { method: "POST" }).then((r) =>
        r.json(),
      );
      if (res.error) throw new Error(res.error);
      await refresh(view.match.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!view || view.match.terminal) return;
    if (view.match.to_move === humanSeat) return;
    const t = setTimeout(() => {
      void bot();
    }, 280);
    return () => clearTimeout(t);
  }, [view?.match.revision, view?.match.to_move, view?.match.terminal]);

  const yourTurn = view && !view.match.terminal && view.match.to_move === humanSeat;

  return (
    <section className="table-wrap">
      <div className="desk-bar">
        <p className="kicker">
          {!view
            ? "Seat 0 is you. Seat 1 is the bot, or the agent on this page."
            : view.match.terminal
              ? `Over · ${view.match.rewards.map((r) => (r > 0 ? `+${r}` : r)).join(" / ")}`
              : yourTurn
                ? "Your turn"
                : "Waiting"}
        </p>
        <button type="button" className="quiet" onClick={start} disabled={busy}>
          {view ? "Deal again" : "Sit down"}
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      {view?.observation?.view?.html ? (
        <GameView
          view={view.observation.view}
          legal={yourTurn ? view.observation.legal_actions : []}
          disabled={busy || !yourTurn}
          onAction={(id) => {
            setClickedAt(Date.now());
            void act(id);
          }}
        />
      ) : view?.observation?.ui ? (
        <UiTree
          node={view.observation.ui}
          legal={yourTurn ? view.observation.legal_actions : []}
          disabled={busy || !yourTurn}
          onAction={(id) => {
            setClickedAt(Date.now());
            void act(id);
          }}
        />
      ) : null}

      {view && (
        <div className="tape">
          <div className="tape-head">
            <span>Trajectory · {view.steps?.length ?? 0} steps</span>
            <a href={`/api/episodes?match_id=${view.match.id}&format=jsonl`}>JSONL</a>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>seat</th>
                <th>action</th>
                <th>legal</th>
                <th>r</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {(view.steps ?? []).map((s) => (
                <tr key={s.index}>
                  <td>{s.index}</td>
                  <td>{s.seat}</td>
                  <td>{s.action}</td>
                  <td>{s.legal_actions.length}</td>
                  <td>{s.reward}</td>
                  <td>{s.latency_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
