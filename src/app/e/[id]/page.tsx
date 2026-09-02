import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { PlayDesk } from "@/components/PlayDesk";
import { VerifyPanel } from "@/components/VerifyPanel";

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
      <p className="eyebrow">{env.published ? "Published" : "Draft"} · {env.id}</p>
      <h1>{env.name}</h1>
      <p className="lede">{env.description}</p>
      <p className="muted">
        revision {env.revision} · {env.code_hash.slice(0, 19)} · {env.players} seats
      </p>
      <div className="tabs" style={{ marginTop: "1.2rem" }}>
        <a className="on" href={`/e/${env.id}`}>
          Play
        </a>
        <a href={`/e/${env.id}/verify`}>Verify</a>
        <a href={`/e/${env.id}/spec`}>Spec</a>
      </div>
      <div className="layout-2">
        <PlayDesk environmentId={env.id} />
        <aside className="side">
          <p className="eyebrow">Validation</p>
          <VerifyPanel report={env.validation} players={env.players} />
        </aside>
      </div>
      <p className="record-note">
        Matches on this page are recorded as anonymous trajectories. Download the JSONL from the
        panel, or ask an agent to call export_episodes.
      </p>
    </main>
  );
}
