import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { PlayDesk } from "@/components/PlayDesk";
import { EnvChrome } from "@/components/EnvChrome";

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
    <EnvChrome env={env} current="play">
      <PlayDesk environmentId={env.id} />
      <p className="note">
        Every move is written to a trajectory. Ask the agent for export_episodes, or download the
        tape under the board.
      </p>
    </EnvChrome>
  );
}
