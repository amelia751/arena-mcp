"use client";

import { readSkin, type Skin, type UINode } from "@/lib/ui-tree";

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
  const skin = readSkin(node);
  return (
    <div className="table" data-skin={skin}>
      <Node n={node} legal={legal} onAction={onAction} disabled={disabled} skin={skin} />
    </div>
  );
}

function Node({
  n,
  legal,
  onAction,
  disabled,
  skin,
}: {
  n: UINode;
  legal: string[];
  onAction?: (id: string) => void;
  disabled?: boolean;
  skin: Skin;
}) {
  switch (n.type) {
    case "column":
      return (
        <div className="stack">
          {n.children?.map((c, i) => (
            <Node key={i} n={c} legal={legal} onAction={onAction} disabled={disabled} skin={skin} />
          ))}
        </div>
      );
    case "row":
      return (
        <div className="spread">
          {n.children?.map((c, i) => (
            <Node key={i} n={c} legal={legal} onAction={onAction} disabled={disabled} skin={skin} />
          ))}
        </div>
      );
    case "grid":
      return <Grid n={n} legal={legal} onAction={onAction} disabled={disabled} skin={skin} />;
    case "hand":
      return (
        <div className="hand">
          {(n.cards ?? []).map((card, i) => (
            <span key={i} className="playing-card">
              <em>{String(card)}</em>
            </span>
          ))}
          {Array.from({ length: n.facedown ?? 0 }).map((_, i) => (
            <span key={`d${i}`} className="playing-card back" />
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
      return <span className="badge">{n.text}</span>;
    case "actions":
      if (legal.some((a) => a.startsWith("col_"))) return null;
      return (
        <div className="moves">
          {(n.items && n.items.length
            ? n.items
            : legal.map((id) => ({ id, label: labelFor(id) }))
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className="move"
              disabled={disabled || !legal.includes(item.id)}
              onClick={() => onAction?.(item.id)}
            >
              {item.label}
            </button>
          ))}
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
  skin,
}: {
  n: UINode;
  legal: string[];
  onAction?: (id: string) => void;
  disabled?: boolean;
  skin: Skin;
}) {
  const rows = n.rows ?? 0;
  const cols = n.cols ?? 0;
  const cells = Array.isArray(n.cells) ? n.cells : [];
  const dropCols = legal.some((a) => a.startsWith("col_"));
  const cellActions = legal.some((a) => a.startsWith("cell_"));
  const size = skin === "felt" && cols >= 6 ? "2.55rem" : skin === "paper" ? "3.4rem" : "2.85rem";

  return (
    <div className="grid-wrap">
      {dropCols && (
        <div className="drops" style={{ gridTemplateColumns: `repeat(${cols}, ${size})` }}>
          {Array.from({ length: cols }).map((_, c) => {
            const id = `col_${c}`;
            return (
              <button
                key={id}
                type="button"
                className="drop"
                disabled={disabled || !legal.includes(id)}
                onClick={() => onAction?.(id)}
                aria-label={`Column ${c + 1}`}
              />
            );
          })}
        </div>
      )}
      <div className="board" style={{ gridTemplateColumns: `repeat(${cols}, ${size})` }}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const row = Array.isArray(cells[r]) ? (cells[r] as unknown[]) : [];
            const mark = normalize(row[c]);
            const id = `cell_${r * cols + c}`;
            const clickable = cellActions && legal.includes(id);
            const letter = n.marks?.[mark] ?? (skin === "paper" ? mark.toUpperCase() : "");
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                className={`cell ${mark ? `has-${mark}` : "empty"}`}
                disabled={disabled || !clickable}
                onClick={() => clickable && onAction?.(id)}
              >
                {skin === "paper" ? letter : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function normalize(raw: unknown): string {
  if (raw === 0 || raw === "x" || raw === "X") return "x";
  if (raw === 1 || raw === "o" || raw === "O") return "o";
  if (raw == null || raw === "") return "";
  return String(raw);
}

function labelFor(id: string) {
  if (id.startsWith("col_")) return String(Number(id.slice(4)) + 1);
  if (id.startsWith("cell_")) return String(Number(id.slice(5)) + 1);
  return id.replace(/_/g, " ");
}
