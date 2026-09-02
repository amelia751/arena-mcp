const NODE_TYPES = new Set([
  "column",
  "row",
  "grid",
  "hand",
  "stat",
  "text",
  "actions",
  "log",
  "badge",
]);

export type Skin = "felt" | "paper" | "ink";

export type UINode = {
  type: string;
  skin?: Skin;
  children?: UINode[];
  rows?: number;
  cols?: number;
  cells?: unknown;
  palette?: Record<string, string>;
  marks?: Record<string, string>;
  cards?: unknown[];
  facedown?: number;
  label?: string;
  value?: string | number;
  text?: string;
  items?: Array<{ id: string; label: string }>;
  lines?: string[];
  tone?: string;
};

export const SKINS = new Set<Skin>(["felt", "paper", "ink"]);

export function readSkin(node: UINode | null | undefined): Skin {
  const s = node?.skin;
  return s && SKINS.has(s) ? s : "paper";
}

export function validateUITree(node: unknown, path = "render"): string[] {
  const errors: string[] = [];
  walk(node, path, errors, 0);
  return errors;
}

function walk(node: unknown, path: string, errors: string[], depth: number) {
  if (depth > 8) {
    errors.push(`${path}: tree deeper than 8`);
    return;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`${path}: expected a node object`);
    return;
  }
  const n = node as UINode;
  if (typeof n.type !== "string" || !NODE_TYPES.has(n.type)) {
    errors.push(
      `${path}: unknown type ${JSON.stringify(n.type)}. Allowed: ${[...NODE_TYPES].join(", ")}`,
    );
    return;
  }
  if (n.type === "column" || n.type === "row") {
    if (!Array.isArray(n.children)) {
      errors.push(`${path}: ${n.type} needs children[]`);
      return;
    }
    n.children.forEach((c, i) => walk(c, `${path}.children[${i}]`, errors, depth + 1));
  }
  if (n.type === "grid") {
    if (typeof n.rows !== "number" || typeof n.cols !== "number") {
      errors.push(`${path}: grid needs numeric rows and cols`);
    }
  }
}

export function fallbackTree(observation: unknown, legal: string[]): UINode {
  return {
    type: "column",
    children: [
      { type: "text", text: "Fallback view — render() was missing or invalid." },
      { type: "text", text: JSON.stringify(observation, null, 2) },
      {
        type: "actions",
        items: legal.map((id) => ({ id, label: id })),
      },
    ],
  };
}
