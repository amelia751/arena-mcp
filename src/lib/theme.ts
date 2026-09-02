export type EnvIconName =
  | "grid"
  | "discs"
  | "cards"
  | "star"
  | "hex"
  | "diamond"
  | "tiles"
  | "plus";

export type EnvTheme = {
  color: string;
  icon: EnvIconName;
};

const KNOWN: Record<string, EnvTheme> = {
  env_tictactoe: { color: "#f7d046", icon: "grid" },
  env_connect_four: { color: "#e36c5a", icon: "discs" },
  env_kuhn: { color: "#c4a8e8", icon: "cards" },
};

const PALETTE: EnvTheme[] = [
  { color: "#f9df6d", icon: "star" },
  { color: "#a0c35a", icon: "hex" },
  { color: "#b0c4ef", icon: "diamond" },
  { color: "#ba81c5", icon: "plus" },
  { color: "#7ec8c3", icon: "tiles" },
  { color: "#e3e3e1", icon: "star" },
];

const BLURBS: Record<string, string> = {
  env_tictactoe: "Get three in a row on a 3×3 grid.",
  env_connect_four: "Drop a disc. First to four in a row wins.",
  env_kuhn: "A three-card game. You only see your hand.",
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function envTheme(id: string): EnvTheme {
  return KNOWN[id] ?? PALETTE[hashId(id) % PALETTE.length];
}

export function cardBlurb(env: { id: string; description: string }): string {
  if (BLURBS[env.id]) return BLURBS[env.id];
  const first = env.description.split(/(?<=[.!?])\s/)[0]?.trim() || env.description.trim();
  if (!first) return "Play this one.";
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
}
