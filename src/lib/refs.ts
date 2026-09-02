import type { EnvCode, Environment } from "./types";
import { codeHash, now } from "./ids";

export const TICTACTOE_CODE: EnvCode = {
  init: `function init(seed) {
  return { board: [null, null, null, null, null, null, null, null, null], to_move: 0, rng_cursor: seed };
}`,
  legal_actions: `function legal_actions(state, player) {
  if (player !== state.to_move) return [];
  var out = [];
  for (var i = 0; i < 9; i++) if (state.board[i] === null) out.push("cell_" + i);
  return out;
}`,
  observe: `function observe(state, player) {
  return { board: state.board, to_move: state.to_move, you_are: player };
}`,
  step: `function step(state, action) {
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
  if (won) return { state: next, rewards: state.to_move === 0 ? [1, -1] : [-1, 1], terminal: true };
  if (full) return { state: next, rewards: [0, 0], terminal: true };
  return { state: next, rewards: [0, 0], terminal: false };
}`,
  render: `function render(observation) {
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
    { type: "stat", label: "to move", value: observation.to_move === observation.you_are ? "you" : "opponent" },
    { type: "actions" }
  ]};
}`,
};

export const CONNECT_FOUR_CODE: EnvCode = {
  init: `function init(seed) {
  var board = [];
  for (var r = 0; r < 6; r++) { var row = []; for (var c = 0; c < 7; c++) row.push(null); board.push(row); }
  return { board: board, to_move: 0, rng_cursor: seed };
}`,
  legal_actions: `function legal_actions(state, player) {
  if (player !== state.to_move) return [];
  var out = [];
  for (var c = 0; c < 7; c++) if (state.board[0][c] === null) out.push("col_" + c);
  return out;
}`,
  observe: `function observe(state, player) {
  return { board: state.board, to_move: state.to_move, you_are: player };
}`,
  step: `function step(state, action) {
  if (typeof action !== "string" || action.indexOf("col_") !== 0) throw new Error("illegal action");
  var c = parseInt(action.slice(4), 10);
  if (!(c >= 0 && c < 7)) throw new Error("illegal column");
  var b = [];
  for (var r = 0; r < 6; r++) b.push(state.board[r].slice());
  var row = -1;
  for (var i = 5; i >= 0; i--) if (b[i][c] === null) { row = i; break; }
  if (row === -1) throw new Error("illegal: column full");
  b[row][c] = state.to_move;
  function win(rr, cc, dr, dc) {
    var n = 0;
    for (var k = -3; k <= 3; k++) {
      var y = rr + k * dr, x = cc + k * dc;
      if (y >= 0 && y < 6 && x >= 0 && x < 7 && b[y][x] === state.to_move) { n++; if (n === 4) return true; }
      else n = 0;
    }
    return false;
  }
  var won = win(row, c, 0, 1) || win(row, c, 1, 0) || win(row, c, 1, 1) || win(row, c, 1, -1);
  var full = true;
  for (var x = 0; x < 7; x++) if (b[0][x] === null) full = false;
  var next = { board: b, to_move: 1 - state.to_move, rng_cursor: state.rng_cursor };
  if (won) return { state: next, rewards: state.to_move === 0 ? [1, -1] : [-1, 1], terminal: true };
  if (full) return { state: next, rewards: [0, 0], terminal: true };
  return { state: next, rewards: [0, 0], terminal: false };
}`,
  render: `function render(observation) {
  var cells = [];
  for (var r = 0; r < 6; r++) {
    var row = [];
    for (var c = 0; c < 7; c++) {
      var v = observation.board[r][c];
      row.push(v === 0 ? "x" : v === 1 ? "o" : "");
    }
    cells.push(row);
  }
  return { type: "column", children: [
    { type: "grid", rows: 6, cols: 7, cells: cells, palette: { x: "amber", o: "sky" } },
    { type: "actions" }
  ]};
}`,
};

export const KUHN_CODE: EnvCode = {
  init: `function init(seed) {
  var deck = [0, 1, 2];
  var cursor = seed;
  for (var i = 2; i > 0; i--) {
    var j = Math.floor(rng(cursor++) * (i + 1));
    var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return { hands: [deck[0], deck[1]], burned: deck[2], pot: 2, bets: [1, 1], history: [], to_move: 0, rng_cursor: cursor };
}`,
  legal_actions: `function legal_actions(state, player) {
  if (player !== state.to_move) return [];
  var h = state.history;
  if (h.length && h[h.length - 1] === "bet") return ["fold", "call"];
  return ["check", "bet"];
}`,
  observe: `function observe(state, player) {
  return {
    your_card: state.hands[player],
    pot: state.pot,
    history: state.history.slice(),
    you_are: player,
    to_move: state.to_move
  };
}`,
  step: `function step(state, action) {
  var legal = (function () {
    var h = state.history;
    if (h.length && h[h.length - 1] === "bet") return ["fold", "call"];
    return ["check", "bet"];
  })();
  var ok = false;
  for (var i = 0; i < legal.length; i++) if (legal[i] === action) ok = true;
  if (!ok) throw new Error("illegal action");
  var h = state.history.concat([action]);
  var me = state.to_move;
  var bets = state.bets.slice();
  var pot = state.pot;
  if (action === "bet" || action === "call") { bets[me] += 1; pot += 1; }
  var next = { hands: state.hands, burned: state.burned, pot: pot, bets: bets, history: h, to_move: 1 - me, rng_cursor: state.rng_cursor };
  if (action === "fold") {
    return { state: next, rewards: me === 0 ? [-bets[0], bets[0]] : [bets[1], -bets[1]], terminal: true };
  }
  var last2 = h.length >= 2 ? h[h.length - 2] + "," + h[h.length - 1] : "";
  if (last2 === "check,check" || last2 === "bet,call") {
    var w = state.hands[0] > state.hands[1] ? 0 : 1;
    var amt = Math.min(bets[0], bets[1]);
    return { state: next, rewards: w === 0 ? [amt, -amt] : [-amt, amt], terminal: true };
  }
  return { state: next, rewards: [0, 0], terminal: false };
}`,
  render: `function render(observation) {
  var ranks = ["J", "Q", "K"];
  return { type: "column", children: [
    { type: "hand", cards: [ranks[observation.your_card] || String(observation.your_card)] },
    { type: "stat", label: "pot", value: observation.pot },
    { type: "log", lines: observation.history },
    { type: "badge", text: observation.to_move === observation.you_are ? "your turn" : "waiting", tone: "amber" },
    { type: "actions" }
  ]};
}`,
};

function env(
  id: string,
  name: string,
  description: string,
  code: EnvCode,
): Environment {
  const t = now();
  return {
    id,
    name,
    description,
    players: 2,
    code,
    revision: 1,
    code_hash: codeHash(code),
    published: true,
    confirmed_info_flow: true,
    validation: null,
    created_at: t,
    updated_at: t,
  };
}

export function referenceEnvironments(): Environment[] {
  return [
    env(
      "env_tictactoe",
      "Tic-Tac-Toe",
      "3×3 perfect-information game. The worked example in the authoring guide.",
      TICTACTOE_CODE,
    ),
    env(
      "env_connect_four",
      "Connect Four",
      "6×7 grid. Drop a disc; first to four in a row wins. Perfect information.",
      CONNECT_FOUR_CODE,
    ),
    env(
      "env_kuhn",
      "Kuhn Poker",
      "3-card poker. Each player sees only their own card. Hidden information.",
      KUHN_CODE,
    ),
  ];
}
