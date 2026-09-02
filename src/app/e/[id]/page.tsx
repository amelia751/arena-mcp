import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { PlayDesk } from "@/components/PlayDesk";
import { EnvTabs } from "@/components/EnvTabs";

export const dynamic = "force-dynamic";

export default async function EnvironmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const env = await getEnvironment(id);
  if (!env) notFound();

  return (
    <main>
      <header className="env-head">
        <p className="kicker">
          {env.kind === "template" ? "Pattern" : env.published ? "Published" : "Draft"}
        </p>
        <h1>{env.name}</h1>
        {env.description && <p className="lede">{env.description}</p>}
        <p className="meta">
          {env.id} · rev {env.revision} · {env.players} seats
        </p>
      </header>
      <EnvTabs id={env.id} current="play" />
      <PlayDesk environmentId={env.id} />
      <p className="note">
        Every move is written to a trajectory. Ask the agent for export_episodes, or download the
        tape under the board.
      </p>
    </main>
  );
}
