"use client";

import type { InfoFlowRow, ValidationReport } from "@/lib/types";

export function VerifyPanel({
  report,
  players = 2,
}: {
  report: ValidationReport | null;
  players?: number;
}) {
  if (!report) {
    return <p className="muted">No validation run yet.</p>;
  }
  return (
    <div className="verify">
      <p className={`banner ${report.ok ? "ok" : "bad"}`}>
        {report.ok ? "All checks passed." : `${report.failures.length} check(s) failed.`}
      </p>
      <ul className="checks">
        {report.checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : "bad"}>
            <strong>{c.id}</strong> {c.summary}
            {c.detail && <pre>{c.detail}</pre>}
          </li>
        ))}
      </ul>
      {report.playouts && (
        <p className="muted">
          {report.playouts.n} playouts · mean {report.playouts.mean_length} steps ·{" "}
          {report.playouts.ms} ms · outcomes {report.playouts.balance.join(" / ")}
        </p>
      )}
      <FlowMatrix rows={report.info_flow} players={players} />
    </div>
  );
}

export function FlowMatrix({ rows, players }: { rows: InfoFlowRow[]; players: number }) {
  if (!rows.length) return null;
  return (
    <div className="matrix">
      <p className="eyebrow">Information flow</p>
      <table>
        <thead>
          <tr>
            <th>field</th>
            {Array.from({ length: players }).map((_, i) => (
              <th key={i}>seat {i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field}>
              <td>{r.field}</td>
              {r.seats.map((s, i) => (
                <td key={i} className={s}>
                  {s}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
