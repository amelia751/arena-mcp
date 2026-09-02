"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GameView } from "./GameView";
import type { AuthoredView } from "@/lib/view";
import { registerDesk, type SessionMatch } from "@/lib/session";
import { playerName } from "@/lib/seats";

const subscribeNothing = () => () => {};
const hasModelContext = () =>
  !!(document.modelContext ?? navigator.modelContext)?.registerTool;

type Observation = {
  observation: unknown;
  legal_actions: string[];
  view?: AuthoredView;
  seat: number;
  revision: number;
};

type StepRow = {
  index: number;
  seat: number;
  action: string;
  reward: number;
  terminal: boolean;
  legal_actions: string[];
  interface: string;
  latency_ms: number;
};

type MatchInfo = {
  id: string;
  revision: number;
  to_move: number;
  terminal: boolean;
  rewards: number[];
  environment_id: string;
  environment_name: string;
  seats: Array<{ seat: number; player_type: string; interface: string }>;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  return res.json();
}

export function PlayDesk({
  environmentId,
  humanSeat = 0,
}: {
  environmentId: string;
  humanSeat?: number;
}) {
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [obs, setObs] = useState<Observation | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chosenOpponent, setOpponent] = useState<"agent" | "bot" | null>(null);
  // An agent on the page takes the other seat; without one, the bot fills in.
  const agentPresent = useSyncExternalStore(subscribeNothing, hasModelContext, () => false);
  const opponent = chosenOpponent ?? (agentPresent ? "agent" : "bot");
  const presentedAt = useRef<number | null>(null);
  const matchRef = useRef<MatchInfo | null>(null);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  const toSession = useCallback(
    (m: MatchInfo | null): SessionMatch | null =>
      m
        ? {
            match_id: m.id,
            environment_id: m.environment_id,
            environment_name: m.environment_name,
            human_seat: humanSeat,
            agent_seat: 1 - humanSeat,
            revision: m.revision,
            to_move: m.to_move,
            terminal: m.terminal,
            rewards: m.rewards,
          }
        : null,
    [humanSeat],
  );

  const load = useCallback(
    async (matchId: string) => {
      const [m, o] = await Promise.all([
        json<{ match: MatchInfo; steps: StepRow[] }>(`/api/matches/${matchId}`),
        json<Observation>(`/api/matches/${matchId}/observation?seat=${humanSeat}`),
      ]);
      setMatch(m.match);
      setSteps(m.steps ?? []);
      setObs(o);
      // Latency for a human move is time spent thinking about the position,
      // not time between mousedown and the fetch.
      presentedAt.current =
        m.match && !m.match.terminal && m.match.to_move === humanSeat ? Date.now() : null;
      return m.match;
    },
    [humanSeat],
  );

  const start = useCallback(
    async (opts?: { seat?: number; agent_label?: string }) => {
      setBusy(true);
      setErr(null);
      try {
        const res = await json<{ match: MatchInfo; error?: string }>("/api/matches", {
          method: "POST",
          body: JSON.stringify({
            environment_id: environmentId,
            seat: opts?.seat ?? humanSeat,
            agent_label: opts?.agent_label,
          }),
        });
        if (res.error) throw new Error(res.error);
        setSteps([]);
        const m = await load(res.match.id);
        return toSession(m)!;
      } finally {
        setBusy(false);
      }
    },
    [environmentId, humanSeat, load, toSession],
  );

  const act = useCallback(
    async (action: string) => {
      const m = matchRef.current;
      if (!m) return;
      setBusy(true);
      setErr(null);
      try {
        const res = await json<{ error?: string }>(`/api/matches/${m.id}/action`, {
          method: "POST",
          body: JSON.stringify({
            action,
            expected_revision: m.revision,
            seat: humanSeat,
            interface: "human_ui",
            latency_ms: presentedAt.current ? Date.now() - presentedAt.current : undefined,
          }),
        });
        if (res.error) throw new Error(res.error);
        await load(m.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [humanSeat, load],
  );

  useEffect(() => {
    registerDesk({
      environment_id: environmentId,
      match: () => toSession(matchRef.current),
      start,
      refresh: async () => {
        const m = matchRef.current;
        if (!m) return null;
        return toSession(await load(m.id));
      },
      setOpponent,
    });
    return () => registerDesk(null);
  }, [environmentId, start, load, toSession]);

  // The bot only fills in when no agent is driving the other seat.
  useEffect(() => {
    if (opponent !== "bot") return;
    if (!match || match.terminal || match.to_move === humanSeat) return;
    const t = setTimeout(async () => {
      try {
        await json(`/api/matches/${match.id}/bot`, { method: "POST" });
        await load(match.id);
      } catch {
        /* surfaced on the next refresh */
      }
    }, 320);
    return () => clearTimeout(t);
  }, [opponent, match, humanSeat, load]);

  // While the agent is thinking, watch for its move so the board keeps up.
  useEffect(() => {
    if (opponent !== "agent") return;
    if (!match || match.terminal || match.to_move === humanSeat) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const m = await json<{ match: MatchInfo }>(`/api/matches/${match.id}`);
        if (!stop && m.match && m.match.revision !== match.revision) await load(match.id);
      } catch {
        /* keep polling */
      }
      if (!stop) timer = setTimeout(tick, 900);
    };
    let timer = setTimeout(tick, 900);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [opponent, match, humanSeat, load]);

  const yourTurn = !!match && !match.terminal && match.to_move === humanSeat;
  const agentSeat = 1 - humanSeat;

  return (
    <section className="table-wrap">
      <div className="desk-bar">
        <p
          className={
            !match
              ? "status"
              : match.terminal
                ? "status status-over"
                : yourTurn
                  ? "status status-you"
                  : "status status-wait"
          }
        >
          {!match
            ? `You are ${playerName(humanSeat)} · ${playerName(agentSeat)} is ${opponent === "agent" ? "the agent" : "the bot"}`
            : match.terminal
              ? `Over · ${match.rewards.map((r) => (r > 0 ? `+${r}` : r)).join(" / ")}`
              : yourTurn
                ? "Your turn"
                : opponent === "agent"
                  ? "Waiting for the agent"
                  : "Waiting"}
        </p>
        <div className="desk-actions">
          <button
            type="button"
            className="pill"
            onClick={() => setOpponent(opponent === "agent" ? "bot" : "agent")}
            title="Who plays the other seat"
          >
            {opponent === "agent" ? "Opponent: agent" : "Opponent: bot"}
          </button>
          <button type="button" className="pill" onClick={() => void start()} disabled={busy}>
            {match ? "Deal again" : "Start playing"}
          </button>
        </div>
      </div>

      {err && <p className="err">{err}</p>}

      {obs?.view?.html ? (
        <GameView
          view={obs.view}
          legal={yourTurn ? obs.legal_actions : []}
          disabled={busy || !yourTurn}
          environmentId={environmentId}
          matchId={match?.id ?? null}
          moved={steps.length > 0}
          onAction={(id) => void act(id)}
        />
      ) : null}

      {match && (
        <div className="tape">
          <div className="tape-head">
            <span>Trajectory · {steps.length} steps</span>
            <a href={`/api/episodes?match_id=${match.id}&format=jsonl`}>JSONL</a>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>seat</th>
                <th>by</th>
                <th>action</th>
                <th>legal</th>
                <th>r</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.index}>
                  <td>{s.index}</td>
                  <td>{s.seat}</td>
                  <td>{s.interface === "webmcp" ? "agent" : s.interface === "bot" ? "bot" : "you"}</td>
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
