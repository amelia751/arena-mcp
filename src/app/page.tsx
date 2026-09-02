import { listEnvironments } from "@/lib/store";
import { EnvCard } from "@/components/EnvCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const games = await listEnvironments();

  if (games.length === 0) {
    return (
      <main>
        <section className="blank">
          <h1>Nothing here yet.</h1>
          <p>
            This page has no games of its own. Every table on it gets written from scratch by an
            agent working alongside you — the rules, the board, and the way it looks.
          </p>
          <p className="blank-hint">
            Open this page in a browser that speaks to your assistant, then ask it to design
            something and play you.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="gallery">
        <p className="section-label">Made here</p>
        <ul className="card-grid">
          {games.map((env) => (
            <li key={env.id}>
              <EnvCard env={env} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
