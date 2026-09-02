import Link from "next/link";
import { listEnvironments } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authored = (await listEnvironments()).filter((e) => e.kind === "authored");
  return (
    <main>
      <p className="kicker">Ask your agent to design one</p>
      <h1>This table is empty until something is authored here.</h1>
      <p className="lede">
        Describe the game. The agent writes five functions on this page. Arena checks whether they
        run, whether they leak, and whether they end — then you play the result.
      </p>

      {authored.length === 0 ? (
        <div className="workshop">Nothing on the table yet.</div>
      ) : (
        <section className="session">
          <p className="kicker">Authored this session</p>
          <ul className="session-list">
            {authored.map((env) => (
              <li key={env.id}>
                <a href={`/e/${env.id}`}>
                  <strong>{env.name}</strong>
                  <span>{env.published ? "published" : env.validation?.ok ? "valid" : "draft"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="patterns">
        Hidden patterns the agent can fork:{" "}
        <Link href="/e/env_tictactoe">Tic-Tac-Toe</Link>
        {" · "}
        <Link href="/e/env_connect_four">Connect Four</Link>
        {" · "}
        <Link href="/e/env_kuhn">Kuhn Poker</Link>
      </p>
    </main>
  );
}
