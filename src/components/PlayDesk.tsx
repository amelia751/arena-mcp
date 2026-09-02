"use client";

import { useEffect, useState } from "react";
import { UiTree } from "./UiTree";
import type { UINode } from "@/lib/ui-tree";

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
    ui: UINode;
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
    observation: unknown;
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

  async function act(action: string, iface: "human_ui" | "bot" = "human_ui") {
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
          interface: iface,
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
    }, 350);
    return () => clearTimeout(t);
  }, [view?.match.revision, view?.match.to_move, view?.match.terminal]);

  const yourTurn = view && !view.match.terminal && view.match.to_move === humanSeat;

  return (
    <section className="desk">
      <header className="desk-head">
        <div>
          <p className="eyebrow">Play</p>
          <h2>{view?.match.environment_name ?? "New match"}</h2>
        </div>
        <div className="desk-actions">
          <button type="button" className="act ghost" onClick={start} disabled={busy}>
            {view ? "New match" : "Start match"}
          </button>
          {view && !view.match.terminal && view.match.to_move !== humanSeat && (
            <button type="button" className="act ghost" onClick={bot} disabled={busy}>
              Bot move
            </button>
          )}
        </div>
      </header>

      {!view && (
        <p className="lede">
          Seat 0 is you. Seat 1 is the built-in random bot — or an agent using the play tools on
          this page.
        </p>
      )}

      {err && <p className="err">{err}</p>}

      {view?.match.terminal && (
        <p className="banner">
          Game over. Returns {view.match.rewards.map((r) => (r > 0 ? `+${r}` : r)).join(" / ")}.
        </p>
      )}

      {view?.observation && (
        <UiTree
          node={view.observation.ui}
          legal={yourTurn ? view.observation.legal_actions : []}
          disabled={busy || !yourTurn}
          onAction={(id) => {
            setClickedAt(Date.now());
            void act(id);
          }}
        />
      )}

      {view && (
        <div className="data-panel">
          <div className="data-head">
            <p className="eyebrow">Trajectory</p>
            <a href={`/api/episodes?match_id=${view.match.id}&format=jsonl`}>Download JSONL</a>
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
              {!view.steps?.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    Rows appear as each move is played.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
