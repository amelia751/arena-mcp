import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { CODE_KEYS } from "@/lib/types";
import { EnvTabs } from "@/components/EnvTabs";

export const dynamic = "force-dynamic";

export default async function SpecPage({
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
        <p className="kicker">Spec</p>
        <h1>{env.name}</h1>
      </header>
      <EnvTabs id={env.id} current="spec" />
      {CODE_KEYS.map((k) => (
        <section key={k} style={{ marginBottom: "1.4rem" }}>
          <p className="kicker">{k}</p>
          <pre className="code-block">{env.code[k] || "// empty"}</pre>
        </section>
      ))}
    </main>
  );
}
