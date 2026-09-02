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
    return <p className="muted">No report yet.</p>;
  }
  return (
    <div>
      <p className={report.ok ? "ok" : "bad"}>
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
          {report.playouts.ms} ms
        </p>
      )}
      <RenderCoverage coverage={report.render_coverage} />
      <FlowMatrix rows={report.info_flow} players={players} />
    </div>
  );
}

function RenderCoverage({ coverage }: { coverage: ValidationReport["render_coverage"] }) {
  if (!coverage) return null;
  const { painted, dark } = coverage;
  if (!painted.length && !dark.length) return null;
  return (
    <div className="tape" style={{ marginTop: "1.4rem" }}>
      <div className="tape-head">
        <span>
          What the table shows · {painted.length} of {painted.length + dark.length} fields
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>observation field</th>
            <th>on screen</th>
          </tr>
        </thead>
        <tbody>
          {painted.concat(dark).slice(0, 40).map((field) => (
            <tr key={field}>
              <td>{field}</td>
              <td className={dark.includes(field) ? "hidden" : "own"}>
                {dark.includes(field) ? "not drawn" : "drawn"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlowMatrix({ rows, players }: { rows: InfoFlowRow[]; players: number }) {
  if (!rows.length) return null;
  return (
    <div className="tape" style={{ marginTop: "1.4rem" }}>
      <div className="tape-head">
        <span>Information flow</span>
      </div>
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
