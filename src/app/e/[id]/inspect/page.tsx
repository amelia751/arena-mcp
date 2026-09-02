import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { EnvChrome } from "@/components/EnvChrome";
import { InspectDesk } from "@/components/InspectDesk";

export const dynamic = "force-dynamic";

export default async function InspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const env = await getEnvironment(id);
  if (!env) notFound();

  return (
    <EnvChrome env={env} current="inspect">
      <p className="note">
        Walk the game without playing it. Switch seats at the same position to see exactly what
        each side is told — in a game with hidden cards, the two views should not match.
      </p>
      <InspectDesk environmentId={env.id} />
    </EnvChrome>
  );
}
