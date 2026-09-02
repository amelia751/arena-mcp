export const AUTHORING_GUIDE = `# Authoring an environment

An environment is five pure JavaScript functions plus the table they draw. You write all of it.

No modules, no Date, no Math.random, no I/O. The sandbox injects rng(n), a seeded PRNG. If the
game needs chance, keep a rng_cursor on state and thread it through.

## The five functions

init(seed) -> state
  state MUST include a numeric to_move (the seat whose turn it is, 0-indexed).
  Add rng_cursor: seed if you will draw random values.

legal_actions(state, player) -> string[]
  Return [] when it is not that player's turn. Never [] for to_move on a non-terminal state.
  Action ids are short strings: "col_3", "cell_4", "bet".

observe(state, player) -> observation
  This is the fair-play boundary. Return only what that seat may know.
  Perfect-information games can return the board. Hidden-information games must project:
  return your_card, not both hands. Never return the raw state object if it holds a secret.

step(state, action) -> { state, rewards, terminal }
  rewards is a number[] with one entry per player. Throw if the action is not legal.
  Wins are usually [1,-1] or [-1,1]; draws [0,0].

render(observation) -> { html, css }
  You write the table as HTML and CSS strings. The page mounts them in a sandboxed frame,
  wires clicks, and disables anything that is not currently legal.

## Writing render()

- Return { html: "...", css: "..." }. Both are strings. A UI tree is not accepted.
- Every clickable control needs data-action="<legal action id>" and should be a
  <button aria-label="..."> so it is focusable and has a name.
- No <script>, no onclick, no url(), no @import, no external images. They are stripped.
- Draw from the observation. Every cell, card and counter must be read out of the values you
  were handed — never hardcoded. Include whose turn it is.
- Size things yourself. Wrap the board in width:max-content so the surface hugs the grid
  instead of stretching, and put controls on the same grid template as the columns they act on.

## The loop that matters: look at what you built

You cannot tell whether a board is right by reading your own HTML. Call preview_view.

  preview_view({ html, css })                       - look at a draft
  preview_view({ environment_id })                  - look at the saved render()
  preview_view({ environment_id, moves: ["col_3","col_4"] })  - look at it mid-game
  inspect_view()                                    - look at the live table someone is playing

It answers with what actually painted: repeated boxes come back as a character grid with the real
colours, everything else as positioned text, plus every control with its size, plus a list of
problems. For example:

  ok: false
  size: 306x286px

  what painted:
  grid 7 cols x 6 rows, cell 40x40px:
    . . . . . . .
    . . . . . . .
    . . . . . . .
    . . . . . . .
    . . . A . . .
    . . B A . . .
    legend: .=#14392c x40  A=#d4a24a x2  B=#efe6d4 x1
  around it:
    [Column 1 -> col_0]  [Column 2 -> col_1]  ...
    your turn

  problems to fix:
    - the 7 controls are up to 31px off from the columns they act on

Read the grid like a picture. If you played col_3 twice and the A discs are not stacked in the
fourth column, your markup and your state disagree. Always preview mid-game with moves — an empty
board looks correct even when nothing is wired up. Fix, save, preview again, and keep going until
problems is empty.

## Making it look good

The page around you is warm paper (#f4efe6) with dark ink (#1c1814). Aim for something that looks
like a real object sitting on a desk, not a web form.

Boards: a dark felt slab (#1b4a38) with generous rounded corners and circular holes cut into it
(#14392c). Pieces as discs with a radial highlight so they read as physical - gold
(radial-gradient(circle at 32% 28%, #f3d37a, #d4a24a 62%, #a87a20)) for seat 0, bone
(#fffaf0 -> #efe6d4 -> #c9bea6) for seat 1. Drop controls above each column with a small chevron.

Notebook games: no outer box, just ink rules. Serif marks, opponent in rust (#b33a1a).

Cards: white rectangles, rank in the corner, serif, soft shadow underneath. Actions as dark pills.

Keep the whole table under about 420px wide so it sits comfortably beside the trajectory panel.

## Worked example — Tic-Tac-Toe

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
  if (!(i >= 0 && i < 9)) throw new Error("illegal cell");
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
  var marks = ["X", "O"];
  var html = "<div class='ttt'><div class='board'>";
  for (var i = 0; i < 9; i++) {
    var v = observation.board[i];
    var mark = v === null ? "" : marks[v];
    var cls = v === 1 ? "cell o" : "cell";
    html += "<button class='" + cls + "' data-action='cell_" + i + "' aria-label='Cell " + (i+1) + "'>" + mark + "</button>";
  }
  html += "</div><p class='who'>" + (observation.to_move === observation.you_are ? "your turn" : "waiting") + "</p></div>";
  var css = ".ttt{display:flex;flex-direction:column;align-items:center;gap:12px;width:max-content}"
    + ".board{display:grid;grid-template-columns:repeat(3,54px)}"
    + ".cell{width:54px;height:54px;border:0;border-right:2.5px solid #1c1814;border-bottom:2.5px solid #1c1814;background:#faf6ee;font:28px Georgia,serif;color:#1c1814}"
    + ".cell:nth-child(3n){border-right:0}.cell:nth-child(n+7){border-bottom:0}.cell.o{color:#b33a1a}"
    + ".who{margin:0;color:#6e675c;font-size:14px}";
  return { html: html, css: css };
}

## Order of work

1. create_environment with a name and whatever functions you have. Partial is fine.
2. Fix whatever validation reports. It names the function and the line.
3. Write render, then preview_view. Then preview_view with moves. Then fix. Then again.
4. update_environment patches one function at a time — quote expected_revision.
5. When every check passes: describe_dataset, publish_environment.
6. start_match puts the board on the person's screen with you in the other seat. Then
   get_observation, take_action, wait_for_turn while they think, and inspect_view whenever you
   want to confirm the board shows what you think it shows.
`;
