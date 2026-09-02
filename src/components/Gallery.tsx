"use client";

import { useCallback, useEffect, useState } from "react";
import { EnvCard } from "./EnvCard";
import { registerLive } from "@/lib/live";

type Card = { id: string; name: string; description: string };

async function loadCards(): Promise<Card[]> {
  const res = await fetch("/api/environments", { cache: "no-store" });
  const body = (await res.json()) as { environments?: Card[] };
  return body.environments ?? [];
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

export function Gallery() {
  const [games, setGames] = useState<Card[] | null>(null);

  const reload = useCallback(async () => {
    setGames(await loadCards());
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, []);

  useEffect(() => registerLive(reload), [reload]);

  useEffect(() => {
    let stale = false;
    const draw = async () => {
      const next = await loadCards();
      if (!stale) setGames(next);
    };
    const tick = setInterval(() => void draw(), 2000);
    const onVis = () => {
      if (document.visibilityState === "visible") void draw();
    };
    void draw();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stale = true;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!games || games.length === 0) {
    return (
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
    );
  }

  return (
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
  );
}
