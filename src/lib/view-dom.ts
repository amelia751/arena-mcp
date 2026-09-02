import { listDataActions, sanitizeView, type AuthoredView } from "./view";

export type InspectResult = {
  snapshot: string;
  actions: string[];
  size: { width: number; height: number };
  warnings: string[];
  interactive: number;
};

type LiveTable = {
  snapshot: (opts?: { interactive?: boolean }) => InspectResult | null;
};

let live: LiveTable | null = null;

export function registerLiveTable(table: LiveTable | null) {
  live = table;
}

export function snapshotLiveTable(opts?: { interactive?: boolean }): InspectResult | null {
  return live?.snapshot(opts) ?? null;
}

export function snapshotElement(
  root: ParentNode,
  opts?: { interactive?: boolean },
): InspectResult {
  const refs = { n: 0 };
  const warnings: string[] = [];
  const lines: string[] = [];
  const start =
    "body" in root && (root as Document).body
      ? (root as Document).body
      : root;
  const kids = start instanceof Element ? [start] : Array.from(start.children);
  for (const node of kids) walk(node, 0, refs, lines, warnings, !!opts?.interactive);
  const html =
    "innerHTML" in start
      ? String((start as HTMLElement | ShadowRoot).innerHTML)
      : "";
  const actions = listDataActions(html);
  const sized = kids.find((n): n is HTMLElement => n instanceof HTMLElement);
  const box = sized
    ? { width: Math.round(sized.scrollWidth), height: Math.round(sized.scrollHeight) }
    : { width: 0, height: 0 };
  return {
    snapshot: lines.join("\n") || "(empty)",
    actions,
    size: box,
    warnings,
    interactive: refs.n,
  };
}

export async function snapshotDraft(
  view: AuthoredView,
  opts?: { interactive?: boolean; legal?: string[] },
): Promise<InspectResult> {
  if (typeof document === "undefined") {
    return {
      snapshot: "(server)",
      actions: listDataActions(view.html),
      size: { width: 0, height: 0 },
      warnings: ["snapshot requires the page"],
      interactive: 0,
    };
  }
  const clean = sanitizeView(view);
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:720px;min-height:200px;opacity:0;pointer-events:none";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>*{box-sizing:border-box}button{font:inherit}${clean.view.css}</style>${clean.view.html}`;
  await sleep(30);
  const result = snapshotElement(root, opts);
  if (opts?.legal?.length) {
    const missing = opts.legal.filter((a) => !result.actions.includes(a));
    if (missing.length) {
      result.warnings.push(`legal actions with no data-action: ${missing.join(", ")}`);
    }
  }
  if (clean.stripped.length) {
    result.warnings.push(`stripped: ${clean.stripped.join(", ")}`);
  }
  host.remove();
  return result;
}

function walk(
  el: Element,
  depth: number,
  refs: { n: number },
  lines: string[],
  _warnings: string[],
  interactiveOnly: boolean,
) {
  if (depth > 16) return;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
  const role = implicitRole(el);
  const action = el.getAttribute("data-action");
  const name = el.getAttribute("aria-label") || shortText(el);
  const clickable = !!(action || role === "button" || el.tagName === "BUTTON");
  if (!interactiveOnly || clickable) {
    const id = `e${refs.n++}`;
    const row = [`- role: ${role}`, `  ref: ${id}`];
    if (name) row.splice(1, 0, `  name: ${clip(name, 80)}`);
    if (action) row.push(`  action: ${action}`);
    if (el.hasAttribute("disabled")) row.push("  states: [disabled]");
    lines.push(row.join("\n"));
  }
  for (const child of Array.from(el.children)) {
    walk(child, depth + 1, refs, lines, _warnings, interactiveOnly);
  }
}

function implicitRole(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a") return "link";
  if (tag === "h1" || tag === "h2" || tag === "h3") return "heading";
  if (tag === "p") return "text";
  if (tag === "ol" || tag === "ul") return "list";
  if (tag === "li") return "listitem";
  if (tag === "img") return "image";
  if (tag === "table") return "table";
  return tag;
}

function shortText(el: Element): string {
  const own = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return own;
}

function clip(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
