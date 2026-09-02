import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { VerifyPanel } from "@/components/VerifyPanel";
import { RevalidateButton } from "@/components/RevalidateButton";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const env = await getEnvironment(id);
  if (!env) notFound();
  return (
    <main>
      <p className="eyebrow">Verify · {env.id}</p>
      <h1>{env.name}</h1>
      <div className="tabs" style={{ marginTop: "1.2rem" }}>
        <a href={`/e/${env.id}`}>Play</a>
        <a className="on" href={`/e/${env.id}/verify`}>
          Verify
        </a>
        <a href={`/e/${env.id}/spec`}>Spec</a>
      </div>
      <div className="side">
        <RevalidateButton id={env.id} />
        <VerifyPanel report={env.validation} players={env.players} />
      </div>
    </main>
  );
}
