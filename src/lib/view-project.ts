export type ProjectOptions = {
  legal?: string[];
  /** True when the caller knows the position is not the opening one, so a
   *  uniform board means the markup is ignoring the observation. */
  varied?: boolean;
};

export type Control = {
  action: string;
  name: string;
  tag: string;
  w: number;
  h: number;
  enabled: boolean;
};

export type Projection = {
  picture: string;
  controls: Control[];
  actions: string[];
  size: { width: number; height: number };
  /** Things that stop the table working. */
  problems: string[];
  /** Things worth improving that do not block play. */
  notes: string[];
};

/**
 * Runs inside the view frame and describes what actually painted: repeated
 * same-size boxes become a character grid, everything else becomes positioned
 * text. Serialized with String(project) and injected into the frame, so it must
 * stay self-contained — no imports, no closure references.
 */
export function project(options?: ProjectOptions): Projection {
  const opts = options || {};
  const legal: string[] = opts.legal || [];
  const problems: string[] = [];
  const notes: string[] = [];

  type Node = {
    el: Element;
    r: DOMRect;
    text: string;
    name: string;
    action: string | null;
    paint: string | null;
    leaf: boolean;
    round: boolean;
    disabled: boolean;
  };

  function squash(s: string): string {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function ownText(el: Element): string {
    const out: string[] = [];
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        const t = squash(n.textContent || "");
        if (t) out.push(t);
      }
    });
    return out.join(" ");
  }

  function parseColor(v: string): { r: number; g: number; b: number; a: number } | null {
    const m = String(v).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length < 3 || p.some((x) => isNaN(x))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function toHex(c: { r: number; g: number; b: number }): string {
    const h = (v: number) => {
      const s = Math.round(v).toString(16);
      return s.length < 2 ? "0" + s : s;
    };
    return "#" + h(c.r) + h(c.g) + h(c.b);
  }

  function paintOf(el: Element): string | null {
    const cs = getComputedStyle(el);
    const img = cs.backgroundImage;
    if (img && img !== "none") {
      const found = img.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/);
      if (found) {
        const raw = found[0];
        if (raw.charAt(0) === "#") return raw.toLowerCase().slice(0, 7);
        const c = parseColor(raw);
        return c ? toHex(c) : "img";
      }
      return "img";
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0.05) return toHex(bg);
    return null;
  }

  function luminance(c: { r: number; g: number; b: number }): number {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  const nodes: Node[] = [];
  const all = document.body ? document.body.querySelectorAll("*") : [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    nodes.push({
      el,
      r,
      text: ownText(el),
      name: squash(el.getAttribute("aria-label") || el.textContent || ""),
      action: el.getAttribute("data-action"),
      paint: paintOf(el),
      leaf: el.children.length === 0,
      round: radius >= Math.min(r.width, r.height) / 2 - 1,
      disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
    });
  }

  // --- repeated same-size leaves become a grid -----------------------------
  type Grid = { members: Node[]; cols: number[]; rows: number[]; w: number; h: number };

  function axis(values: number[], tol: number): number[] {
    const sorted = values.slice().sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      if (!out.length || v - out[out.length - 1] > tol) out.push(v);
    }
    return out;
  }

  const buckets: Record<string, Node[]> = {};
  for (const n of nodes) {
    if (!n.leaf) continue;
    const key = Math.round(n.r.width / 2) * 2 + "x" + Math.round(n.r.height / 2) * 2;
    (buckets[key] = buckets[key] || []).push(n);
  }

  const grids: Grid[] = [];
  const claimed = new Set<Element>();
  const bucketKeys = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length);
  for (const key of bucketKeys) {
    const members = buckets[key];
    if (members.length < 6) continue;
    const tol = Math.max(4, members[0].r.width / 3);
    const cols = axis(members.map((n) => n.r.left + n.r.width / 2), tol);
    const rows = axis(members.map((n) => n.r.top + n.r.height / 2), Math.max(4, members[0].r.height / 3));
    if (cols.length < 2 || rows.length < 2) continue;
    if (cols.length * rows.length > members.length * 1.5) continue;
    for (const n of members) claimed.add(n.el);
    grids.push({ members, cols, rows, w: members[0].r.width, h: members[0].r.height });
  }

  const lines: string[] = [];

  function nearest(values: number[], v: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < values.length; i++) {
      const d = Math.abs(values[i] - v);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  for (const g of grids) {
    const cells: (Node | null)[][] = [];
    for (let r = 0; r < g.rows.length; r++) cells.push(new Array(g.cols.length).fill(null));
    for (const n of g.members) {
      const c = nearest(g.cols, n.r.left + n.r.width / 2);
      const r = nearest(g.rows, n.r.top + n.r.height / 2);
      cells[r][c] = n;
    }

    const tally: Record<string, number> = {};
    const keyOf = (n: Node | null) => {
      if (!n) return "gap";
      return n.text ? "t:" + n.text : "c:" + (n.paint || "none");
    };
    for (const row of cells) for (const n of row) tally[keyOf(n)] = (tally[keyOf(n)] || 0) + 1;

    const ranked = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    const glyph: Record<string, string> = {};
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let next = 0;
    for (const k of ranked) {
      if (k === "gap") glyph[k] = " ";
      else if (k === ranked[0]) glyph[k] = ".";
      else if (k.indexOf("t:") === 0 && k.length === 3) glyph[k] = k.charAt(2);
      else glyph[k] = letters.charAt(next++ % letters.length);
    }

    lines.push(
      `grid ${g.cols.length} cols x ${g.rows.length} rows, cell ${Math.round(g.w)}x${Math.round(g.h)}px:`,
    );
    for (const row of cells) lines.push("  " + row.map((n) => glyph[keyOf(n)]).join(" "));
    const legend = ranked
      .filter((k) => k !== "gap")
      .map((k) => {
        const label = k.indexOf("t:") === 0 ? '"' + k.slice(2) + '"' : k.slice(2);
        return `${glyph[k]}=${label} x${tally[k]}`;
      });
    if (tally["gap"]) legend.push(`(blank)=no element x${tally["gap"]}`);
    lines.push("  legend: " + legend.join("  "));

    const distinct = ranked.filter((k) => k !== "gap").length;
    if (distinct <= 1 && opts.varied) {
      problems.push(
        `every cell of the ${g.cols.length}x${g.rows.length} grid looks identical even though pieces have been played — render() is not reading the observation into the cells`,
      );
    }
  }

  // --- everything else, in reading order ----------------------------------
  const flow = nodes.filter((n) => {
    if (claimed.has(n.el)) return false;
    if (n.action) return true;
    if (n.text) return true;
    return n.leaf && !!n.paint;
  });

  const rowTol = 10;
  flow.sort((a, b) => {
    const dy = a.r.top - b.r.top;
    if (Math.abs(dy) > rowTol) return dy;
    return a.r.left - b.r.left;
  });

  const flowLines: string[] = [];
  let current: Node[] = [];
  let currentTop = -1e9;
  const flush = () => {
    if (!current.length) return;
    const parts = current.map((n) => {
      if (n.action) {
        const label = n.name || n.text || n.action;
        return `[${label}${n.disabled ? " (disabled)" : ""} -> ${n.action}]`;
      }
      if (n.text) return n.text;
      return `<${n.round ? "disc" : "box"} ${n.paint} ${Math.round(n.r.width)}x${Math.round(n.r.height)}>`;
    });
    flowLines.push("  " + parts.join("  "));
    current = [];
  };
  for (const n of flow) {
    if (n.r.top - currentTop > rowTol) {
      flush();
      currentTop = n.r.top;
    }
    current.push(n);
  }
  flush();
  if (flowLines.length) {
    lines.push(grids.length ? "around it:" : "layout:");
    for (const l of flowLines.slice(0, 40)) lines.push(l);
    if (flowLines.length > 40) lines.push(`  … ${flowLines.length - 40} more rows`);
  }

  // --- controls and their problems ----------------------------------------
  const controls: Control[] = [];
  const seen: Record<string, boolean> = {};
  for (const n of nodes) {
    if (!n.action) continue;
    controls.push({
      action: n.action,
      name: n.name || "",
      tag: n.el.tagName.toLowerCase(),
      w: Math.round(n.r.width),
      h: Math.round(n.r.height),
      enabled: !n.disabled,
    });
    seen[n.action] = true;
    if (n.el.tagName !== "BUTTON") {
      problems.push(
        `data-action="${n.action}" is a <${n.el.tagName.toLowerCase()}> — use <button aria-label="…"> so it is focusable and has a name`,
      );
    }
    if (!n.name) problems.push(`data-action="${n.action}" has no text or aria-label`);
    if (n.r.width < 24 || n.r.height < 16) {
      problems.push(
        `data-action="${n.action}" is only ${Math.round(n.r.width)}x${Math.round(n.r.height)}px — too small to click reliably`,
      );
    }
  }
  if (!controls.length) {
    problems.push('nothing painted a data-action. Put data-action="<legal id>" on clickable elements.');
  }
  for (const id of legal) {
    if (!seen[id]) problems.push(`legal action "${id}" has no data-action in the markup`);
  }

  // --- layout problems -----------------------------------------------------
  const root = document.getElementById("arena-root") || document.body;
  const rootRect = root ? root.getBoundingClientRect() : null;
  const width = root ? Math.round(Math.max(root.scrollWidth, rootRect ? rootRect.width : 0)) : 0;
  const height = root ? Math.round(Math.max(root.scrollHeight, rootRect ? rootRect.height : 0)) : 0;
  const frameWidth = Math.round(window.innerWidth);

  if (grids.length) {
    const g = grids[0];
    const left = Math.min(...g.members.map((n) => n.r.left));
    const right = Math.max(...g.members.map((n) => n.r.right));
    const container = g.members[0].el.parentElement;
    if (container) {
      const cr = container.getBoundingClientRect();
      const slackL = left - cr.left;
      const slackR = cr.right - right;
      // Only meaningful when the container really does enclose the grid.
      if (slackL >= -1 && slackR >= -1 && Math.abs(slackR - slackL) > 24) {
        notes.push(
          `the grid sits off-centre in its container — ${Math.round(slackL)}px of space on the left but ${Math.round(slackR)}px on the right. Give the container width:max-content so it hugs the grid.`,
        );
      }
    }

    const ctlNodes = nodes.filter((n) => n.action && !claimed.has(n.el));
    if (ctlNodes.length >= 2 && ctlNodes.length === g.cols.length) {
      const sortedCtl = ctlNodes.slice().sort((a, b) => a.r.left - b.r.left);
      let worst = 0;
      for (let i = 0; i < g.cols.length; i++) {
        const centre = sortedCtl[i].r.left + sortedCtl[i].r.width / 2;
        worst = Math.max(worst, Math.abs(centre - g.cols[i]));
      }
      if (worst > 12) {
        const ctlPitch =
          sortedCtl.length > 1
            ? (sortedCtl[sortedCtl.length - 1].r.left - sortedCtl[0].r.left) / (sortedCtl.length - 1)
            : 0;
        const colPitch =
          g.cols.length > 1 ? (g.cols[g.cols.length - 1] - g.cols[0]) / (g.cols.length - 1) : 0;
        const detail =
          Math.abs(ctlPitch - colPitch) > 2
            ? `the controls repeat every ${Math.round(ctlPitch)}px but the columns repeat every ${Math.round(colPitch)}px — give both the same grid-template-columns and the same gap`
            : `the two rows start at different x positions — put the controls and the grid in one container and match the container's padding on both`;
        notes.push(
          `the ${ctlNodes.length} controls are up to ${Math.round(worst)}px away from the columns they act on: ${detail}`,
        );
      }
    }
  }

  for (const n of nodes) {
    if (n.text && n.el.scrollWidth > n.el.clientWidth + 2 && n.el.clientWidth > 0) {
      problems.push(`text is clipped in <${n.el.tagName.toLowerCase()}>: "${n.text.slice(0, 40)}"`);
      break;
    }
  }
  if (width > 620) {
    notes.push(
      `the table is ${width}px wide — keep it under about 420px so it sits beside the trajectory panel`,
    );
  }
  for (const n of nodes) {
    if (n.r.right > frameWidth + 4 && frameWidth > 0) {
      problems.push(
        `content runs off the right edge, out to ${Math.round(n.r.right)}px in a ${frameWidth}px frame`,
      );
      break;
    }
  }
  for (const n of nodes) {
    if (!n.text || !n.paint || n.paint.charAt(0) !== "#") continue;
    const pairs = n.paint.slice(1).match(/../g);
    if (!pairs || pairs.length < 3) continue;
    const fg = parseColor(getComputedStyle(n.el).color);
    const bg = parseColor("rgb(" + pairs.map((h) => parseInt(h, 16)).join(",") + ")");
    if (!fg || !bg) continue;
    const l1 = luminance(fg) + 0.05;
    const l2 = luminance(bg) + 0.05;
    const ratio = l1 > l2 ? l1 / l2 : l2 / l1;
    if (ratio < 2.2) {
      notes.push(`"${n.text.slice(0, 30)}" is low contrast against ${n.paint} — hard to read`);
      break;
    }
  }

  const dedupe = (items: string[]) => {
    const out: string[] = [];
    for (const i of items) if (out.indexOf(i) < 0) out.push(i);
    return out;
  };

  let picture = lines.join("\n");
  if (!picture) picture = "(nothing painted)";
  if (picture.length > 2600) picture = picture.slice(0, 2570) + "\n… (truncated)";

  return {
    picture,
    controls,
    actions: controls.map((c) => c.action),
    size: { width, height },
    problems: dedupe(problems).slice(0, 6),
    notes: dedupe(notes).slice(0, 4),
  };
}
