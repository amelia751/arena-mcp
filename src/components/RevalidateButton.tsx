"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevalidateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="act ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/environments/${id}/validate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Running checks…" : "Run V0–V6"}
    </button>
  );
}
