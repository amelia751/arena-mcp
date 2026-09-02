// wait_for_turn has to wait for a turn, not for a revision. An agent that asks
// while the board is already its own must be answered, not left holding.
const BASE = process.env.ARENA_BASE || "http://localhost:3000";
const j = (p, init) => fetch(BASE + p, init).then((r) => r.json());
const post = (p, b) =>
  j(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

let failures = 0;
function check(what, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
}

const m = await post("/api/matches", { environment_id: "env_tictactoe", human_seat: 0 });
const id = m.match_id ?? m.match?.id;
const rev0 = m.revision ?? m.match?.revision ?? 1;
check("a match starts", Boolean(id), JSON.stringify(m).slice(0, 160));

const played = await post(`/api/matches/${id}/action`, {
  action: "cell_0",
  seat: 0,
  expected_revision: rev0,
  interface: "human_ui",
});
check("the human's move lands", !played.error, played.error ?? "");

// The agent lost count of the revision and passes a stale one. It is still its turn.
const t0 = Date.now();
const mine = await j(`/api/matches/${id}/wait?after_revision=99&seat=1&timeout_ms=8000`);
const quick = Date.now() - t0;
check("asking when the board is already yours answers at once", mine.status === "ready" && quick < 2000, `${mine.status} in ${quick}ms`);
check("and it hands back the position", mine.observation?.legal_actions?.length > 0);

// Now it is the human's turn again, and waiting is the right thing to do.
await post(`/api/matches/${id}/action`, {
  action: mine.observation.legal_actions[0],
  seat: 1,
  expected_revision: mine.match.revision,
  interface: "webmcp",
});
const t1 = Date.now();
const theirs = await j(`/api/matches/${id}/wait?after_revision=99&seat=1&timeout_ms=1000`);
check(
  "asking when it is their move still waits",
  theirs.status === "still_waiting" && Date.now() - t1 >= 900,
  theirs.status,
);

console.log(failures ? `\n${failures} failed` : "\nall good");
process.exit(failures ? 1 : 0);
