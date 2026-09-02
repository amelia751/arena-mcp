import { snapshotOffscreen, type SnapshotOptions } from "./view-frame";
import type { Projection } from "./view-project";
import type { AuthoredView } from "./view";

export type { Projection };

type LiveTable = {
  environment_id: string;
  match_id: string | null;
  snapshot: (opts?: SnapshotOptions) => Promise<Projection>;
  legal: () => string[];
  varied: () => boolean;
};

let live: LiveTable | null = null;

export function registerLiveTable(table: LiveTable | null) {
  live = table;
}

export function liveTable(): LiveTable | null {
  return live;
}

export async function snapshotLiveTable(): Promise<
  (Projection & { environment_id: string; match_id: string | null }) | null
> {
  if (!live) return null;
  const snap = await live.snapshot({ legal: live.legal(), varied: live.varied() });
  return { ...snap, environment_id: live.environment_id, match_id: live.match_id };
}

export async function snapshotDraft(
  view: AuthoredView,
  opts?: SnapshotOptions,
): Promise<Projection> {
  if (typeof document === "undefined") {
    return {
      picture: "(no page)",
      controls: [],
      actions: [],
      size: { width: 0, height: 0 },
      problems: ["looking at the table requires a browser page"],
      notes: [],
    };
  }
  return snapshotOffscreen(view, opts);
}
