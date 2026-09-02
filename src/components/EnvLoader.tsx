"use client";

import { useEffect, useState } from "react";
import { EnvChrome } from "./EnvChrome";
import { PlayDesk } from "./PlayDesk";
import { InspectDesk } from "./InspectDesk";
import { VerifyPanel } from "./VerifyPanel";
import { RevalidateButton } from "./RevalidateButton";
import type { EnvTab } from "./EnvTabs";
import type { Environment } from "@/lib/types";
import { registerLive } from "@/lib/live";

async function loadEnv(id: string): Promise<Environment | null> {
  const res = await fetch(`/api/environments/${id}`, { cache: "no-store" });
  const body = (await res.json()) as Environment & { error?: string };
  if (!res.ok || body.error || !body.id) return null;
  return body;
}

function useEnv(id: string) {
  const [env, setEnv] = useState<Environment | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stale = false;
    const draw = async () => {
      const next = await loadEnv(id);
      if (stale) return;
      if (!next) {
        setMissing(true);
        return;
      }
      setMissing(false);
      setEnv(next);
    };
    const stop = registerLive(draw);
    void draw();
    return () => {
      stale = true;
      stop();
    };
  }, [id]);

  return { env, missing };
}

function Shell({
  id,
  tab,
  children,
}: {
  id: string;
  tab: EnvTab;
  children: (env: Environment) => React.ReactNode;
}) {
  const { env, missing } = useEnv(id);
  if (missing) {
    return (
      <main>
        <p className="note">That game is not here.</p>
      </main>
    );
  }
  if (!env) {
    return (
      <main>
        <p className="note">Loading…</p>
      </main>
    );
  }
  return <EnvChrome env={env} current={tab}>{children(env)}</EnvChrome>;
}

export function EnvPlay({ id }: { id: string }) {
  return (
    <Shell id={id} tab="play">
      {(env) => (
        <>
          <PlayDesk environmentId={env.id} />
          <p className="note">
            Every move is written to a trajectory. Ask the agent for export_episodes, or download
            the tape under the board.
          </p>
        </>
      )}
    </Shell>
  );
}

export function EnvInspect({ id }: { id: string }) {
  return (
    <Shell id={id} tab="inspect">
      {(env) => (
        <>
          <p className="note">
            Walk the game without playing it. Switch seats at the same position to see exactly what
            each side is told — in a game with hidden cards, the two views should not match.
          </p>
          <InspectDesk environmentId={env.id} code={env.code} />
        </>
      )}
    </Shell>
  );
}

export function EnvVerify({ id }: { id: string }) {
  return (
    <Shell id={id} tab="verify">
      {(env) => (
        <>
          <RevalidateButton id={env.id} />
          <div className="report">
            <VerifyPanel report={env.validation} players={env.players} />
          </div>
        </>
      )}
    </Shell>
  );
}
