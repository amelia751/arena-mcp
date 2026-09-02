import { getEnvironment } from "@/lib/store";
import { notFound } from "next/navigation";
import { CODE_KEYS } from "@/lib/types";
import { EnvChrome } from "@/components/EnvChrome";

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
    <EnvChrome env={env} current="spec">
      {CODE_KEYS.map((k) => (
        <section key={k} className="spec-fn">
          <p className="kicker">{k}</p>
          <pre className="code-block">{env.code[k] || "// empty"}</pre>
        </section>
      ))}
    </EnvChrome>
  );
}
