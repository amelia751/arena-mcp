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

render(observation) -> UI tree
  Constrained JSON, not HTML. Node types:
  column, row { children }
  grid { rows, cols, cells, palette? }   cells is a 2D array of strings
  hand { cards, facedown? }
  stat { label, value }
  text { text }
  actions { items?: [{id, label}] }      omit items to use legal_actions
  log { lines }
  badge { text, tone? }

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
  var cells = [];
  for (var r = 0; r < 3; r++) {
    var row = [];
    for (var c = 0; c < 3; c++) {
      var v = observation.board[r * 3 + c];
      row.push(v === 0 ? "x" : v === 1 ? "o" : "");
    }
    cells.push(row);
  }
  return { type: "column", children: [
    { type: "grid", rows: 3, cols: 3, cells: cells, palette: { x: "amber", o: "sky" } },
    { type: "actions" }
  ]};
}

## How to author

1. Call create_environment with a name and as many functions as you have. Partial is fine.
2. Read the validation failures. They name the function and the line.
3. Patch one function at a time with update_environment.
4. When checks pass, call describe_dataset, then publish_environment.
5. start_match + take_action to play. Prefer forking env_tictactoe or env_connect_four if you are adapting a known game.

Connect Four from Tic-Tac-Toe: 6×7 board, actions col_0..col_6, win is four in a row, gravity (fill from the bottom).
`;
