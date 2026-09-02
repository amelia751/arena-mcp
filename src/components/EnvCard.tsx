import type { Environment } from "@/lib/types";
import { cardBlurb, envTheme } from "@/lib/theme";
import { EnvIcon } from "./EnvIcon";

export function EnvCard({ env }: { env: Environment }) {
  const theme = envTheme(env.id);

  return (
    <article className="game-card">
      <div className="game-card-top" style={{ background: theme.color }}>
        <EnvIcon name={theme.icon} />
        <h2>{env.name}</h2>
      </div>
      <div className="game-card-body">
        <p>{cardBlurb(env)}</p>
        <a className="pill" href={`/e/${env.id}`}>
          Play
        </a>
      </div>
    </article>
  );
}
