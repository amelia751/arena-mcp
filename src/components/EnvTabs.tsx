export function EnvTabs({
  id,
  current,
}: {
  id: string;
  current: "play" | "verify" | "spec";
}) {
  return (
    <nav className="tabs">
      <a className={current === "play" ? "on" : ""} href={`/e/${id}`}>
        Table
      </a>
      <a className={current === "verify" ? "on" : ""} href={`/e/${id}/verify`}>
        Report
      </a>
      <a className={current === "spec" ? "on" : ""} href={`/e/${id}/spec`}>
        Spec
      </a>
    </nav>
  );
}
