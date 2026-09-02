export const AUTHORING_GUIDE = `# Arena environment contract

An environment is five pure JavaScript functions. No modules, no Date, no Math.random, no I/O.
The sandbox injects rng(n) — a seeded PRNG. Thread a rng_cursor through state if you need chance.

## Functions

init(seed) -> state
  state MUST include numeric to_move (current seat, 0-indexed).
  Include rng_cursor: seed if you will draw random values.

legal_actions(state, player) -> string[]
  Empty only when it is not that player's turn. Never empty on a non-terminal state for to_move.
  Action ids are short strings: "col_3", "cell_4", "fold".

observe(state, player) -> observation
  THIS IS THE FAIR-PLAY BOUNDARY. Return only what that seat is allowed to know.
  Never return the raw state object if it holds another seat's private fields.
  Perfect-information games may return the board. Hidden-information games must project.

step(state, action) -> { state, rewards, terminal }
  rewards is a number[] of length equal to the number of players.
  Throw if action is not in legal_actions(state, state.to_move).
  On a win, rewards are typically [1,-1] or [-1,1]. Draws [0,0].

render(observation) -> { html, css }
  You write the table. Return HTML and CSS strings — not a UI tree. No <script>, no event
  handlers, no url(). Put data-action="<legal id>" on every clickable control. The page hosts
  your markup and wires clicks to take_action.
  After you change markup: preview_view({ html, css }) or preview_view({ environment_id }).
  After a match is up: inspect_view(). Look at the tree. Do not guess at layout.

## How the table should feel

You own the look. The surrounding page is warm paper (#f4efe6). Your board sits on it.

Boards (Connect Four and similar): a dark green felt slab (#1b4a38) with rounded corners and
circular holes (#14392c). Seat 0 discs gold (#d4a24a), seat 1 bone (#efe6d4), with a light
radial highlight so they read as physical pieces. Drop controls above each column
(data-action="col_N") with a small downward chevron. Set the board to width:max-content so
the felt hugs the grid instead of stretching across the page.

Notebook games: an ink hash (no outer box), serif X/O, opponent marks in rust (#b33a1a).

Cards: a white rectangle, rank in the corner, serif, soft shadow. Actions as dark pills.

Write that CSS yourself. Call preview_view after every markup change. If the snapshot has no
data-action nodes, the human cannot play.

## Seeing what you built

preview_view — mount a draft (html+css) or run saved render (environment_id) and return the
accessibility tree plus the data-action ids that painted.
inspect_view — snapshot the live table.

## Determinism

Same (seed, action list) must hash to the same states. If you shuffle, do it with rng(cursor++)
and write the next cursor back into state.

## Worked example — Tic-Tac-Toe (copy, then adapt)

function init(seed) {
  return { board: [null,null,null,null,null,null,null,null,null], to_move: 0, rng_cursor: seed };
}
function legal_actions(state, player) {
  if (player !== state.to_move) return [];
  var out = [];
  for (var i = 0; i < 9; i++) if (state.board[i] === null) out.push("cell_" + i);
  return out;
}
function observe(state, player) {
  return { board: state.board, to_move: state.to_move, you_are: player };
}
function step(state, action) {
  if (typeof action !== "string" || action.indexOf("cell_") !== 0) throw new Error("illegal action");
  var i = parseInt(action.slice(5), 10);
  if (state.board[i] !== null) throw new Error("illegal: cell taken");
  var board = state.board.slice();
  board[i] = state.to_move;
  var lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  var won = false;
  for (var L = 0; L < lines.length; L++) {
    var a = lines[L][0], b = lines[L][1], c = lines[L][2];
    if (board[a] === state.to_move && board[b] === state.to_move && board[c] === state.to_move) won = true;
  }
  var full = true;
  for (var k = 0; k < 9; k++) if (board[k] === null) full = false;
  var next = { board: board, to_move: 1 - state.to_move, rng_cursor: state.rng_cursor };
  if (won) return { state: next, rewards: state.to_move === 0 ? [1,-1] : [-1,1], terminal: true };
  if (full) return { state: next, rewards: [0,0], terminal: true };
  return { state: next, rewards: [0,0], terminal: false };
}
function render(observation) {
  var html = "<div class='ttt'><div class='board'>";
  for (var i = 0; i < 9; i++) {
    var v = observation.board[i];
    var mark = v === 0 ? "X" : v === 1 ? "O" : "";
    var cls = v === 0 ? "x" : v === 1 ? "o" : "empty";
    html += "<button class='cell " + cls + "' data-action='cell_" + i + "'>" + mark + "</button>";
  }
  html += "</div><p>" + (observation.to_move === observation.you_are ? "your turn" : "waiting") + "</p></div>";
  var css = ".ttt{display:flex;flex-direction:column;align-items:center;gap:12px}.board{display:grid;grid-template-columns:repeat(3,54px)}.cell{width:54px;height:54px;border:0;border-right:2.5px solid #1c1814;border-bottom:2.5px solid #1c1814;background:#faf6ee;font:28px Georgia,serif}.cell:nth-child(3n){border-right:0}.cell:nth-child(n+7){border-bottom:0}.cell.o{color:#b33a1a}";
  return { html: html, css: css };
}

## How to author

1. Call create_environment with a name and as many functions as you have. Partial is fine.
2. Write render as { html, css }. Call preview_view after each markup change.
3. Read the validation failures. They name the function and the line.
4. Patch one function at a time with update_environment.
5. inspect_view once a match is up. When checks pass, describe_dataset, then publish_environment.
6. Hidden templates you may fork: env_tictactoe, env_connect_four, env_kuhn.

Connect Four: 6×7, actions col_0..col_6, four in a row, gravity (fill from the bottom).
`;
