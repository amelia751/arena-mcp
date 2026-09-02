type Glyph =
  | "person"
  | "book"
  | "eye"
  | "shield"
  | "play"
  | "save"
  | "engine"
  | "frame"
  | "loop"
  | "seats"
  | "store"
  | "plug";

function Icon({ glyph, tone }: { glyph: Glyph; tone?: string }) {
  return (
    <svg
      className="dg-ico"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={tone ? { color: tone } : undefined}
    >
      {shape(glyph)}
    </svg>
  );
}

function shape(glyph: Glyph) {
  switch (glyph) {
    case "person":
      return (
        <>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5.5 19.6c1.3-3.5 3.6-5.2 6.5-5.2s5.2 1.7 6.5 5.2" />
        </>
      );
    case "book":
      return (
        <>
          <path d="M4 5.5h6.2c1 0 1.8.8 1.8 1.8V19a2.4 2.4 0 0 0-2.4-1.7H4z" />
          <path d="M20 5.5h-6.2c-1 0-1.8.8-1.8 1.8V19a2.4 2.4 0 0 1 2.4-1.7H20z" />
        </>
      );
    case "eye":
      return (
        <>
          <path d="M2.6 12S6 6.6 12 6.6 21.4 12 21.4 12 18 17.4 12 17.4 2.6 12 2.6 12z" />
          <circle cx="12" cy="12" r="2.8" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 3.2l7 2.6v6c0 4.2-2.8 7.3-7 9-4.2-1.7-7-4.8-7-9v-6z" />
          <path d="M8.8 12.2l2.3 2.3 4.1-4.6" />
        </>
      );
    case "play":
      return (
        <>
          <circle cx="12" cy="12" r="8.8" />
          <path d="M10 8.6l6 3.4-6 3.4z" />
        </>
      );
    case "save":
      return (
        <>
          <path d="M12 4v10.4" />
          <path d="M8 11l4 3.8 4-3.8" />
          <path d="M4.8 18.6h14.4" />
        </>
      );
    case "engine":
      return (
        <>
          <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.2" />
          <path d="M10 2.8v3.6M14 2.8v3.6M10 17.6v3.6M14 17.6v3.6M2.8 10h3.6M2.8 14h3.6M17.6 10h3.6M17.6 14h3.6" />
        </>
      );
    case "frame":
      return (
        <>
          <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.2" />
          <path d="M3.4 9h17.2" />
          <circle cx="6.4" cy="6.8" r="0.7" />
        </>
      );
    case "loop":
      return (
        <>
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20.4 3.6v4.2h-4.2" />
        </>
      );
    case "seats":
      return (
        <>
          <circle cx="8.4" cy="9" r="2.8" />
          <circle cx="16" cy="9" r="2.8" />
          <path d="M3.4 19c.9-2.6 2.6-3.9 5-3.9M13.2 19c.9-2.6 2.6-3.9 5-3.9" />
        </>
      );
    case "store":
      return (
        <>
          <ellipse cx="12" cy="6.4" rx="7.4" ry="2.8" />
          <path d="M4.6 6.4v11.2c0 1.6 3.3 2.8 7.4 2.8s7.4-1.2 7.4-2.8V6.4" />
          <path d="M4.6 12c0 1.6 3.3 2.8 7.4 2.8s7.4-1.2 7.4-2.8" />
        </>
      );
    case "plug":
      return (
        <>
          <path d="M9 3.4v5M15 3.4v5" />
          <path d="M6.4 8.4h11.2v2.2a5.6 5.6 0 0 1-5.6 5.6 5.6 5.6 0 0 1-5.6-5.6z" />
          <path d="M12 16.2v4.4" />
        </>
      );
  }
}

function Brand({ src, label, note }: { src: string; label: string; note?: string }) {
  return (
    <span className="dg-brand">
      <img src={src} alt="" width={20} height={20} />
      <b>{label}</b>
      {note ? <i>{note}</i> : null}
    </span>
  );
}

function Arrow({ label, area }: { label: string; area: string }) {
  return (
    <div className={`dg-arrow dg-${area}`} aria-hidden="true">
      <span>{label}</span>
      <b>→</b>
    </div>
  );
}

const FNS: Array<[string, string]> = [
  ["init", "seed → state"],
  ["legal_actions", "→ action mask"],
  ["observe", "→ per-seat view"],
  ["step", "→ reward + done"],
  ["render", "→ html + css"],
];

const CHECKS: Array<[string, string]> = [
  ["V0", "it runs"],
  ["V1", "same seed replays"],
  ["V2", "no ambient authority"],
  ["V3", "illegal rejected"],
  ["V4", "playouts terminate"],
  ["V5", "no seat leak"],
  ["V6", "hostable html"],
  ["V7", "markup follows obs"],
  ["V8", "own deal, no undefined"],
];

const TOOLS: Array<{ group: string; glyph: Glyph; tone: string; names: string[] }> = [
  {
    group: "Author",
    glyph: "book",
    tone: "#c69a12",
    names: [
      "get_authoring_guide",
      "list_environments",
      "get_environment",
      "create_environment",
      "update_environment",
      "fork_environment",
    ],
  },
  { group: "See", glyph: "eye", tone: "#4a6fc4", names: ["preview_view", "inspect_view"] },
  {
    group: "Verify",
    glyph: "shield",
    tone: "#1a7f37",
    names: ["validate_environment", "trace_episode", "describe_dataset"],
  },
  {
    group: "Play",
    glyph: "play",
    tone: "#8e4fa0",
    names: [
      "publish_environment",
      "open_environment",
      "start_match",
      "get_observation",
      "take_action",
      "wait_for_turn",
    ],
  },
  { group: "Keep", glyph: "save", tone: "#0f7a74", names: ["export_episodes"] },
];

export function DiagramFigure() {
  return (
    <figure className="diagram">
      <div className="dg">
        <section className="dg-box dg-human">
          <header>
            <Icon glyph="person" />
            <p className="kicker">Human</p>
          </header>
          <p className="dg-sub">Plays in the browser</p>
          <ul className="dg-rows">
            <li>
              <b>Table</b> click <code>data-action</code>
            </li>
            <li>
              <b>Inspect</b> walk a deal, pin a seat
            </li>
            <li>
              <b>Data</b> schema + recorded step
            </li>
          </ul>
        </section>

        <Arrow label="render + click" area="ah" />

        <section className="dg-box dg-agent">
          <header>
            <Icon glyph="plug" />
            <p className="kicker">Agent</p>
          </header>
          <p className="dg-sub">Calls tools on the same page</p>
          <div className="dg-brands">
            <Brand src="/diagram/openai.svg" label="ChatGPT desktop" note="site tools, on by default" />
            <Brand src="/diagram/chrome.svg" label="Chrome 146+" note="enable-webmcp-testing" />
          </div>
        </section>

        <Arrow label="Access" area="aa" />

        <section className="dg-host">
          <header className="dg-hostbar">
            <Brand src="/diagram/netlify.svg" label="Netlify" />
            <span className="dg-plus">+</span>
            <Brand src="/diagram/nextjs.svg" label="Next.js 16" note="App Router" />
            <span className="dg-plus">+</span>
            <Brand src="/diagram/react.svg" label="React 19" />
            <Brand src="/diagram/typescript.svg" label="TS" />
            <span className="dg-url">arena-play-641 · Origin-Agent-Cluster: ?1</span>
          </header>

          <div className="dg-tools-reg">
            <p className="kicker">ArenaTools · client component</p>
            <p>
              <code>document.modelContext.registerTool</code> × 18
            </p>
            <p className="dg-flags">
              <span>AbortSignal on unmount</span>
              <span>readOnlyHint</span>
              <span>untrustedContentHint</span>
              <span>clipped output</span>
            </p>
          </div>

          <div className="dg-down" aria-hidden="true">
            ↓
          </div>

          <div className="dg-mid">
            <div className="dg-fn">
              <p className="kicker">Environment · five pure functions</p>
              <ol>
                {FNS.map(([name, hint], i) => (
                  <li key={name}>
                    <i className="dg-plus">{i === 0 ? "" : "+"}</i>
                    <code>{name}</code>
                    <span>{hint}</span>
                  </li>
                ))}
              </ol>
              <p className="dg-foot">
                shaped like OpenSpiel / PettingZoo — a model can write it from what it already
                knows
              </p>
            </div>
            <div className="dg-col">
              <div className="dg-sub-box">
                <header>
                  <Icon glyph="engine" tone="#c9a227" />
                  <p className="kicker">Sandbox</p>
                </header>
                <Brand src="/diagram/javascript.svg" label="quickjs-emscripten" />
                <p>
                  pure · injected <code>rng(n)</code>
                  <br />
                  no Date + no Math.random + no I/O
                </p>
              </div>
              <div className="dg-sub-box">
                <header>
                  <Icon glyph="frame" tone="#4a6fc4" />
                  <p className="kicker">Authored table</p>
                </header>
                <p>
                  <code>render()</code> html + css in an iframe
                  <br />
                  no same-origin + no network
                  <br />
                  cannot reach <code>modelContext</code>
                </p>
              </div>
            </div>
          </div>

          <div className="dg-down" aria-hidden="true">
            ↓
          </div>

          <div className="dg-loop">
            <header>
              <Icon glyph="loop" tone="#d0021b" />
              <p className="kicker">Validate · V0–V8 + playouts</p>
            </header>
            <ul className="dg-checks">
              {CHECKS.map(([id, what]) => (
                <li key={id}>
                  <b>{id}</b> {what}
                </li>
              ))}
            </ul>
            <div className="dg-gates">
              <span className="dg-gate bad">
                fail → <code>trace_episode</code> + update ⟲
              </span>
              <span className="dg-gate ok">
                ok → <code>preview_view</code> + publish →
              </span>
            </div>
          </div>

          <div className="dg-down" aria-hidden="true">
            ↓
          </div>

          <div className="dg-mid">
            <div className="dg-match">
              <header>
                <Icon glyph="seats" />
                <p className="kicker">Shared match</p>
              </header>
              <p>
                human seat + agent seat → one <code>step()</code>, one revision
              </p>
            </div>

            <div className="dg-store">
              <header>
                <Icon glyph="store" tone="#0f7a74" />
                <Brand src="/diagram/netlify.svg" label="Netlify Blobs" />
              </header>
              <p>
                store <code>arena</code> / <code>db.json</code> — environments · matches · steps
              </p>
            </div>
          </div>
        </section>

        <Arrow label="registers" area="at" />

        <section className="dg-box dg-tools">
          <header>
            <Icon glyph="plug" />
            <p className="kicker">WebMCP tools</p>
          </header>
          <p className="dg-sub">
            <code>document.modelContext</code>
          </p>
          {TOOLS.map((block) => (
            <div
              key={block.group}
              className="dg-group"
              style={{ "--tone": block.tone } as React.CSSProperties}
            >
              <p className="kicker">{block.group}</p>
              <ul>
                {block.names.map((name) => (
                  <li key={name}>
                    <Icon glyph={block.glyph} tone={block.tone} />
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="dg-tail" aria-hidden="true">
          <span>every move, both seats</span>
          <b>↓</b>
        </div>

        <section className="dg-out">
          <p className="kicker">Output · one trajectory dataset</p>
          <div className="dg-outbody">
            <p className="dg-schema">
              <code>episode</code> match_id + environment + seed + seats + returns
              <br />
              <code>step</code> observation + legal_actions + action + reward + terminal +
              latency_ms
              <br />
              <span>interface: human_ui + webmcp · rationale + confidence on the agent seat</span>
            </p>
            <div className="dg-outside">
              <Brand src="/diagram/python.svg" label="arena_dataset.py" note="obs, legal, action, reward, next_obs, done" />
              <Brand src="/diagram/github.svg" label="MIT · trajectories CC0" />
            </div>
          </div>
        </section>
      </div>
      <figcaption>
        Every capability the page has, an agent has too. Each reply carries the new observation,
        the legal actions and the revision to quote next.
      </figcaption>
    </figure>
  );
}
