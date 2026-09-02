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
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // A crashed route answers with an HTML error page. Saying so beats a button
    // that looks like it does nothing.
    throw new Error(`${url} answered ${res.status} with something that is not JSON`);
  }
  return parsed as T;
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
  // The opening position, so the tab shows the actual table before anyone sits down.
  const [preview, setPreview] = useState<AuthoredView | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
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
      } catch (e) {
        // The agent's start_match still needs the throw; the person clicking the
        // button needs to be told, which used to happen nowhere.
        setErr(e instanceof Error ? e.message : String(e));
        throw e;
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

  // What the table looks like at move zero, for anyone who has not sat down yet.
  useEffect(() => {
    if (match) return;
    let stale = false;
    void (async () => {
      try {
        const res = await json<{ view?: AuthoredView; error?: string; note?: string }>(
          `/api/environments/${environmentId}/view?seat=${humanSeat}`,
        );
        if (stale) return;
        if (res.view?.html) setPreview(res.view);
        else setPreviewErr(res.error ?? res.note ?? "render() gave nothing to draw.");
      } catch (e) {
        if (!stale) setPreviewErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stale = true;
    };
  }, [environmentId, humanSeat, match]);

  // The bot only fills in when no agent is driving the other seat. It waits long
  // enough that your own move lands first and reads as yours.
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
    }, 750);
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
  const theirTurn = !!match && !match.terminal && match.to_move !== humanSeat;
  const agentSeat = 1 - humanSeat;
  const them = opponent === "agent" ? "Agent" : "Bot";
  const score = match?.terminal ? match.rewards : null;
  const mine = score?.[humanSeat] ?? 0;
  const last = steps.length ? steps[steps.length - 1] : null;
  const theirLast = last && last.seat !== humanSeat ? last : null;
  // Your own move is a round trip. Without this the bar reads "your turn" for a
  // second after you have already played.
  const sending = busy && yourTurn;

  // Before anyone sits down the table still shows the opening position, so the
  // tab is never a bare button on an empty page.
  const view = obs?.view?.html ? obs.view : preview?.html ? preview : null;

  const seats = [
    { seat: humanSeat, who: "You", on: yourTurn },
    { seat: agentSeat, who: them, on: theirTurn },
  ].sort((a, b) => a.seat - b.seat);

  return (
    <section className="table-wrap">
      <div className="desk-bar">
        <div className="seats">
          {seats.map((s) => (
            <span key={s.seat} className={s.on ? "seat-chip on" : "seat-chip"}>
              <span className="seat-chip-n">{playerName(s.seat)}</span>
              <span className="seat-chip-who">{s.who}</span>
              {score ? (
                <span className="seat-chip-score">
                  {score[s.seat] > 0 ? `+${score[s.seat]}` : score[s.seat]}
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <div className="desk-actions">
          <button
            type="button"
            className="pill"
            onClick={() => setOpponent(opponent === "agent" ? "bot" : "agent")}
            title="Who plays the other seat"
          >
            {opponent === "agent" ? "Opponent: agent" : "Opponent: bot"}
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => void start().catch(() => {})}
            disabled={busy}
          >
            {match ? "Deal again" : "Start playing"}
          </button>
        </div>
      </div>

      <div className="desk-status">
        <p
          className={
            !match
              ? "status"
              : match.terminal
                ? "status status-over"
                : yourTurn && !sending
                  ? "status status-you"
                  : "status status-wait"
          }
        >
          {!match
            ? "Ready when you are"
            : match.terminal
              ? mine > 0
                ? "You won"
                : mine < 0
                  ? `${them} won`
                  : "A draw"
              : sending
                ? "Placing your move"
                : yourTurn
                  ? "Your turn"
                  : `${them} is thinking`}
          {theirTurn || sending ? (
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </p>
        {theirLast ? (
          <p className="last-move" key={theirLast.index}>
            {playerName(theirLast.seat)} played <b>{theirLast.action}</b>
          </p>
        ) : null}
      </div>

      {err && <p className="err">{err}</p>}

      {view ? (
        <div className={match ? undefined : "table-idle"}>
          <GameView
            view={view}
            legal={yourTurn && obs ? obs.legal_actions : []}
            disabled={busy || !yourTurn}
            environmentId={environmentId}
            matchId={match?.id ?? null}
            moved={steps.length > 0}
            onAction={(id) => void act(id)}
          />
        </div>
      ) : (
        <p className="note">{previewErr ?? "Drawing the table…"}</p>
      )}

      {!match && view ? (
        <p className="note idle-note">
          This is the opening position. Press Start playing to take a seat.
        </p>
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
