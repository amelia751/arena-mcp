"use client";

import type { UINode } from "@/lib/ui-tree";

const PALETTE: Record<string, string> = {
  amber: "var(--piece-a)",
  sky: "var(--piece-b)",
  ink: "var(--ink)",
};

export function UiTree({
  node,
  legal,
  onAction,
  disabled,
}: {
  node: UINode | null;
  legal: string[];
  onAction?: (id: string) => void;
  disabled?: boolean;
}) {
  if (!node) return null;
  return <Node n={node} legal={legal} onAction={onAction} disabled={disabled} />;
}

function Node({
  n,
  legal,
  onAction,
  disabled,
}: {
  n: UINode;
  legal: string[];
  onAction?: (id: string) => void;
  disabled?: boolean;
}) {
  switch (n.type) {
    case "column":
      return (
        <div className="flex flex-col gap-3">
          {n.children?.map((c, i) => (
            <Node key={i} n={c} legal={legal} onAction={onAction} disabled={disabled} />
          ))}
        </div>
      );
    case "row":
      return (
        <div className="flex flex-wrap items-center gap-3">
          {n.children?.map((c, i) => (
            <Node key={i} n={c} legal={legal} onAction={onAction} disabled={disabled} />
          ))}
        </div>
      );
    case "grid":
      return <Grid n={n} legal={legal} onAction={onAction} disabled={disabled} />;
    case "hand":
      return (
        <div className="flex gap-2">
          {(n.cards ?? []).map((card, i) => (
            <span key={i} className="card-face">
              {String(card)}
            </span>
          ))}
          {Array.from({ length: n.facedown ?? 0 }).map((_, i) => (
            <span key={`d${i}`} className="card-face facedown">
              ?
            </span>
          ))}
        </div>
      );
    case "stat":
      return (
        <div className="stat">
          <span>{n.label}</span>
          <strong>{String(n.value ?? "")}</strong>
        </div>
      );
    case "text":
      return <pre className="fallback-text">{n.text}</pre>;
    case "log":
      return (
        <ol className="play-log">
          {(n.lines ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      );
    case "badge":
      return <span className={`badge tone-${n.tone || "ink"}`}>{n.text}</span>;
    case "actions":
      if (legal.some((a) => a.startsWith("col_"))) return null;
      return (
        <div className="flex flex-wrap gap-2">
          {(n.items && n.items.length ? n.items : legal.map((id) => ({ id, label: labelFor(id) }))).map(
            (item) => (
              <button
                key={item.id}
                type="button"
                className="act"
                disabled={disabled || !legal.includes(item.id)}
                onClick={() => onAction?.(item.id)}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      );
    default:
      return null;
  }
}

function Grid({
  n,
  legal,
  onAction,
  disabled,
}: {
  n: UINode;
  legal: string[];
  onAction?: (id: string) => void;
  disabled?: boolean;
}) {
  const rows = n.rows ?? 0;
  const cols = n.cols ?? 0;
  const cells = Array.isArray(n.cells) ? n.cells : [];
  const palette = n.palette ?? { x: "amber", o: "sky" };
  const dropCols = legal.some((a) => a.startsWith("col_"));
  const cellActions = legal.some((a) => a.startsWith("cell_"));

  return (
    <div className="grid-wrap">
      {dropCols && (
        <div className="grid-drops" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, c) => {
            const id = `col_${c}`;
            return (
              <button
                key={id}
                type="button"
                className="drop"
                disabled={disabled || !legal.includes(id)}
                onClick={() => onAction?.(id)}
              >
                {c + 1}
              </button>
            );
          })}
        </div>
      )}
      <div
        className="board"
        style={{ gridTemplateColumns: `repeat(${cols}, 2.15rem)` }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const row = Array.isArray(cells[r]) ? (cells[r] as unknown[]) : [];
            const raw = row[c];
            const mark = raw === 0 || raw === "x" || raw === "X" ? "x" : raw === 1 || raw === "o" || raw === "O" ? "o" : raw == null || raw === "" ? "" : String(raw);
            const id = `cell_${r * cols + c}`;
            const clickable = cellActions && legal.includes(id);
            const color = mark ? PALETTE[palette[mark] ?? mark] ?? "var(--ink)" : undefined;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                className={`cell ${mark ? "filled" : ""}`}
                style={color ? { color } : undefined}
                disabled={disabled || !clickable}
                onClick={() => clickable && onAction?.(id)}
              >
                {mark === "x" ? "●" : mark === "o" ? "●" : mark}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function labelFor(id: string) {
  if (id.startsWith("col_")) return `Column ${Number(id.slice(4)) + 1}`;
  if (id.startsWith("cell_")) return `Cell ${Number(id.slice(5)) + 1}`;
  return id.replace(/_/g, " ");
}
