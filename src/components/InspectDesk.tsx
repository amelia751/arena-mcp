"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameView } from "./GameView";
import type { AuthoredView } from "@/lib/view";

type Preview = {
  seed: number;
  seat: number;
  to_move: number;
  moves?: string[];
  observation: unknown;
  legal_actions: string[];
  view?: AuthoredView;
  render?: unknown;
  note?: string;
  error?: string;
};

/** What a person can read off a value without opening the source. */
function shapeOf(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "empty list";
    if (depth > 1) return `list of ${value.length}`;
    const filled = value.find((v) => v !== null && v !== undefined);
    const inner = filled === undefined ? "empty" : shapeOf(filled, depth + 1);
    return `list of ${value.length} × ${inner}`;
  }
  const t = typeof value;
  if (t === "object") {
    const keys = Object.keys(value as object);
    return depth > 1 ? "object" : `object {${keys.join(", ")}}`;
  }
  return t;
}

export function InspectDesk({ environmentId }: { environmentId: string }) {
  const [seed, setSeed] = useState(0);
  // Null follows whoever is to move, so a walk-through does not need babysitting;
  // pinning a seat is how you compare what the two sides are told.
  const [pinned, setPinned] = useState<number | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [data, setData] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const movesKey = moves.join(",");
  const seat = pinned ?? data?.seat ?? 0;

  useEffect(() => {
    let stale = false;
    const draw = async () => {
      setBusy(true);
      const q = new URLSearchParams({ seed: String(seed) });
      if (pinned != null) q.set("seat", String(pinned));
      if (movesKey) q.set("moves", movesKey);
      try {
        const res = await fetch(`/api/environments/${environmentId}/view?${q}`);
        const next = (await res.json()) as Preview;
        if (!stale) setData(next);
      } catch (e) {
        if (!stale) setData({ error: String(e) } as Preview);
      } finally {
        if (!stale) setBusy(false);
      }
    };
    void draw();
    return () => {
      stale = true;
    };
  }, [environmentId, seed, pinned, movesKey]);

  const play = useCallback((action: string) => {
    setMoves((m) => [...m, action]);
  }, []);

  const yourView = data && data.seat === data.to_move;
  const fields = useMemo(() => {
    const o = data?.observation;
    if (!o || typeof o !== "object" || Array.isArray(o)) return [];
    return Object.entries(o as Record<string, unknown>);
  }, [data]);

  return (
    <section className="inspect">
      <div className="inspect-bar">
        <div className="seat-pick" role="group" aria-label="Whose view to show">
          <span className="kicker">Seeing as</span>
          <button
            type="button"
            className={pinned === null ? "pill on" : "pill"}
            onClick={() => setPinned(null)}
          >
            Whoever moves
          </button>
          <button
            type="button"
            className={pinned === 0 ? "pill on" : "pill"}
            onClick={() => setPinned(0)}
          >
            Seat 0
          </button>
          <button
            type="button"
            className={pinned === 1 ? "pill on" : "pill"}
            onClick={() => setPinned(1)}
          >
            Seat 1
          </button>
        </div>
        <div className="desk-actions">
          <button
            type="button"
            className="pill"
            onClick={() => setMoves((m) => m.slice(0, -1))}
            disabled={busy || moves.length === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => setMoves([])}
            disabled={busy || moves.length === 0}
          >
            Reset
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              setMoves([]);
              setSeed((s) => s + 1);
            }}
            disabled={busy}
          >
            Deal {seed + 1}
          </button>
        </div>
      </div>

      {data?.error ? <p className="err">{data.error}</p> : null}
      {data?.note ? <p className="err">{data.note}</p> : null}

      <div className="inspect-split">
        <div className="inspect-board">
          {data?.view?.html ? (
            <GameView
              view={data.view}
              legal={yourView ? data.legal_actions : []}
              disabled={busy || !yourView}
              environmentId={environmentId}
              matchId={null}
              moved={moves.length > 0}
              onAction={play}
              live={false}
            />
          ) : (
            <p className="note">
              {busy ? "Drawing…" : "render() gave nothing to draw at this position."}
            </p>
          )}
          <p className="note">
            {data
              ? data.to_move === seat
                ? "Seat " + seat + " is to move. Click the board to play it forward."
                : `Seat ${data.to_move} is to move — this is what seat ${seat} can see while they wait.`
              : ""}
          </p>
        </div>

        <div className="inspect-data">
          <p className="kicker">What seat {seat} is handed</p>
          {fields.length > 0 ? (
            <table className="shape">
              <tbody>
                {fields.map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{shapeOf(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <pre className="code-block">{JSON.stringify(data?.observation ?? null, null, 2)}</pre>

          <p className="kicker">Legal actions</p>
          <p className="legal-row">
            {data?.legal_actions?.length
              ? data.legal_actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="pill"
                    onClick={() => play(a)}
                    disabled={busy}
                  >
                    {a}
                  </button>
                ))
              : "none — it is not this seat's move"}
          </p>

          <p className="kicker">Line played</p>
          <p className="note">{moves.length ? moves.join(" → ") : "the opening position"}</p>
        </div>
      </div>
    </section>
  );
}
