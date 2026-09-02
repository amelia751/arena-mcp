export type EnvTab = "play" | "inspect" | "verify";

export function EnvTabs({ id, current }: { id: string; current: EnvTab }) {
  const tabs: Array<[EnvTab, string, string]> = [
    ["play", "Table", `/e/${id}`],
    ["inspect", "Inspect", `/e/${id}/inspect`],
    ["verify", "Report", `/e/${id}/verify`],
  ];
  return (
    <nav className="tabs">
      {tabs.map(([key, label, href]) => (
        <a key={key} className={current === key ? "on" : ""} href={href}>
          {label}
        </a>
      ))}
    </nav>
  );
}
