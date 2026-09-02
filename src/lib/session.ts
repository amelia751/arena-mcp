/**
 * The bridge between the board the human is looking at and the tools the agent
 * calls. One page, one match: whatever the agent starts is what the human sees.
 */

export type SessionMatch = {
  match_id: string;
  environment_id: string;
  environment_name: string;
  human_seat: number;
  agent_seat: number;
  revision: number;
  to_move: number;
  terminal: boolean;
  rewards: number[];
};

export type DeskApi = {
  environment_id: string;
  match: () => SessionMatch | null;
  start: (opts?: { seat?: number; agent_label?: string }) => Promise<SessionMatch>;
  refresh: () => Promise<SessionMatch | null>;
  setOpponent: (who: "agent" | "bot") => void;
};

let desk: DeskApi | null = null;
const waiters: Array<(d: DeskApi) => void> = [];

export function registerDesk(api: DeskApi | null) {
  desk = api;
  if (api) {
    while (waiters.length) waiters.shift()!(api);
  }
}

export function currentDesk(): DeskApi | null {
  return desk;
}

export function waitForDesk(ms = 6000): Promise<DeskApi | null> {
  if (desk) return Promise.resolve(desk);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(push);
      if (i >= 0) waiters.splice(i, 1);
      resolve(desk);
    }, ms);
    const push = (d: DeskApi) => {
      clearTimeout(timer);
      resolve(d);
    };
    waiters.push(push);
  });
}

let navigate: ((path: string) => void) | null = null;

export function registerNavigator(fn: ((path: string) => void) | null) {
  navigate = fn;
}

let refresher: (() => Promise<void>) | null = null;

export function registerRefresher(fn: (() => Promise<void>) | null) {
  refresher = fn;
}

/**
 * Anything the agent stores was rendered on the server, so the page the human is
 * looking at will not show it until the route is re-fetched. Tools that write
 * call this before they answer, and it resolves once the new markup is on screen
 * — so a follow-up inspect_view reads the board that the person can actually see.
 */
export async function refreshView(): Promise<void> {
  if (refresher) await refresher();
  // The board's markup came from render() and lives in client state, so re-fetching
  // the route alone would leave a rewritten table on screen looking like the old one.
  await desk?.refresh().catch(() => null);
}

/** Move the human's page to an environment and wait for its board to mount. */
export async function openEnvironment(id: string): Promise<DeskApi | null> {
  if (desk && desk.environment_id === id) return desk;
  const target = `/e/${id}`;
  if (typeof window !== "undefined" && window.location.pathname !== target) {
    if (!navigate) return null;
    registerDesk(null);
    navigate(target);
  }
  const found = await waitForDesk(8000);
  return found && found.environment_id === id ? found : found;
}
