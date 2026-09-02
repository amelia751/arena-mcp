import { listEnvironments } from "@/lib/store";
import { EnvCard } from "@/components/EnvCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const games = await listEnvironments();

  if (games.length === 0) {
    return (
      <main>
        <section className="gallery">
          <p className="blank-line">Nothing here yet.</p>
          <ul className="card-grid">
            <li>
              <BlankCard />
            </li>
            <li>
              <BlankCard />
            </li>
            <li>
              <BlankCard />
            </li>
          </ul>
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

function BlankCard() {
  return (
    <article className="game-card game-card-blank" aria-hidden="true">
      <div className="game-card-top">
        <svg
          className="env-icon"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <rect x="10" y="10" width="28" height="28" rx="6" />
        </svg>
      </div>
      <div className="game-card-body" />
    </article>
  );
}
