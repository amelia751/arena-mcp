import { listEnvironments } from "@/lib/store";
import { EnvCard } from "@/components/EnvCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const all = await listEnvironments();
  const authored = all.filter((e) => e.kind === "authored");
  const patterns = all.filter((e) => e.kind === "template");

  return (
    <main>
      {authored.length > 0 ? (
        <section className="gallery">
          <p className="section-label">Today</p>
          <ul className="card-grid">
            {authored.map((env) => (
              <li key={env.id}>
                <EnvCard env={env} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="gallery">
        {authored.length > 0 ? <p className="section-label">More</p> : null}
        <ul className="card-grid">
          {patterns.map((env) => (
            <li key={env.id}>
              <EnvCard env={env} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
