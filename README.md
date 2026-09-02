# Arena

Author a game environment as five JavaScript functions, verify it, play it against a person or an
agent, and keep the match as reinforcement-learning trajectories.

The human uses the board. An agent on the same page uses tools registered on
`document.modelContext`. Both write into one dataset.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Three reference environments are already published: Tic-Tac-Toe,
Connect Four, and Kuhn Poker.

## The environment contract

```js
init(seed)                   -> state
legal_actions(state, player) -> string[]
observe(state, player)       -> observation
step(state, action)          -> { state, rewards, terminal }
render(observation)          -> UI tree
```

Functions are pure. `Date`, `Math.random`, and I/O are unavailable. Use the injected `rng(n)` if
the game needs chance, and keep a `rng_cursor` on state.

Publishing runs V0–V6: the code runs, the same seed replays, illegal actions are rejected,
random playouts terminate, `observe` does not leak another seat's private fields, and `render`
returns a known UI tree.

## Tools

| Tool | What it does |
| --- | --- |
| `get_authoring_guide` | Contract, UI vocabulary, worked Tic-Tac-Toe |
| `list_environments` | Gallery |
| `get_environment` | Spec and source, optionally one function |
| `create_environment` | New draft; validation runs immediately |
| `fork_environment` | Copy a validated environment |
| `update_environment` | Patch one function |
| `validate_environment` | V0–V6 plus playouts, as repair text |
| `describe_dataset` | Trajectory schema and a sample row |
| `publish_environment` | Shareable `/e/{id}` if checks pass |
| `start_match` | Open a match |
| `get_observation` | That seat's view and legal actions |
| `take_action` | Play a legal action |
| `wait_for_turn` | Bounded wait for the next revision |
| `export_episodes` | JSONL trajectories |

## Dataset

Each match is an `episode` header plus `step` rows:

```
observation, legal_actions, action, reward, terminal, latency_ms
```

Download from the play panel or `GET /api/episodes?match_id=…&format=jsonl`. A Python loader lives
in `arena_dataset.py`.

## License

MIT. Recorded trajectories are intended to be used as training data (CC0).
