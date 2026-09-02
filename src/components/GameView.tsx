"use client";

import { useEffect, useRef } from "react";
import { sanitizeView, type AuthoredView } from "@/lib/view";
import { registerLiveTable, snapshotElement } from "@/lib/view-dom";

export function GameView({
  view,
  legal,
  disabled,
  onAction,
}: {
  view: AuthoredView;
  legal: string[];
  disabled?: boolean;
  onAction?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const actionRef = useRef(onAction);
  actionRef.current = onAction;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const clean = sanitizeView(view);
    root.innerHTML = `<style>
:host{display:block;width:max-content;max-width:100%;margin-inline:auto}
*{box-sizing:border-box}
button{font:inherit;cursor:pointer}
button:disabled{cursor:default}
[data-action][aria-disabled="true"]{pointer-events:none;opacity:.35}
${clean.view.css}
</style>${clean.view.html}`;

    for (const node of root.querySelectorAll<HTMLElement>("[data-action]")) {
      const id = node.getAttribute("data-action") || "";
      const off = !!(disabled || !legal.includes(id));
      if (off) {
        node.setAttribute("disabled", "");
        node.setAttribute("aria-disabled", "true");
      } else {
        node.removeAttribute("disabled");
        node.removeAttribute("aria-disabled");
      }
    }

    const onClick = (e: Event) => {
      const target = (e.target as Element | null)?.closest?.("[data-action]");
      if (!target) return;
      e.preventDefault();
      const id = target.getAttribute("data-action");
      if (!id || disabled || !legal.includes(id)) return;
      actionRef.current?.(id);
    };
    root.addEventListener("click", onClick);
    registerLiveTable({
      snapshot: (opts) => snapshotElement(root, opts),
    });
    return () => {
      root.removeEventListener("click", onClick);
      registerLiveTable(null);
    };
  }, [view.html, view.css, legal.join("|"), disabled]);

  return <div ref={host} className="game-host" />;
}
