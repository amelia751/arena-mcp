import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { CODE_KEYS } from "@/lib/types";

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
      <p className="eyebrow">Spec · {env.id}</p>
      <h1>{env.name}</h1>
      <div className="tabs" style={{ marginTop: "1.2rem" }}>
        <a href={`/e/${env.id}`}>Play</a>
        <a href={`/e/${env.id}/verify`}>Verify</a>
        <a className="on" href={`/e/${env.id}/spec`}>
          Spec
        </a>
      </div>
      {CODE_KEYS.map((k) => (
        <section key={k} style={{ marginBottom: "1.2rem" }}>
          <p className="eyebrow">{k}</p>
          <pre className="code-block">{env.code[k] || "// empty"}</pre>
        </section>
      ))}
    </main>
  );
}
