import { listEnvironments } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const envs = await listEnvironments();
  return (
    <main>
      <p className="eyebrow">Author · verify · play · record</p>
      <h1>Write a game an agent can train on.</h1>
      <p className="lede">
        Describe the environment to your agent. It authors five pure functions on this page. Arena
        runs them, reports what leaks or never ends, and then you play the result. Every match is
        stored as an RL trajectory.
      </p>
      <section className="gallery">
        {envs.map((env) => (
          <a key={env.id} className="card" href={`/e/${env.id}`}>
            <span className={`pill ${env.validation?.ok || env.published ? "ok" : ""}`}>
              {env.published ? "published" : env.validation?.ok ? "valid" : "draft"}
            </span>
            <h3>{env.name}</h3>
            <p>{env.description || `${env.players} players`}</p>
          </a>
        ))}
      </section>
      <p className="lede">
        Agents: call <code>get_authoring_guide</code> first, or fork <code>env_tictactoe</code> /
        <code> env_connect_four</code> / <code>env_kuhn</code>.
      </p>
    </main>
  );
}
