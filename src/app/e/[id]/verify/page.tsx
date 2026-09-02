import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { VerifyPanel } from "@/components/VerifyPanel";
import { RevalidateButton } from "@/components/RevalidateButton";
import { EnvTabs } from "@/components/EnvTabs";

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
      <header className="env-head">
        <p className="kicker">Report</p>
        <h1>{env.name}</h1>
      </header>
      <EnvTabs id={env.id} current="verify" />
      <RevalidateButton id={env.id} />
      <div className="report">
        <VerifyPanel report={env.validation} players={env.players} />
      </div>
    </main>
  );
}
