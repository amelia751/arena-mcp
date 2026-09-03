import { json } from "@/lib/http";

/** Temporary: checks whether a conditional write is honoured from inside a function. */
export async function GET() {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "cas-probe", consistency: "strong" });
  const KEY = "probe.json";

  await store.setJSON(KEY, { round: 0 });
  const first = await store.getWithMetadata(KEY, { type: "text" });
  const stale = first?.etag;

  const a = await store.setJSON(KEY, { round: 1 }, { onlyIfMatch: stale as string });
  const b = await store.setJSON(KEY, { round: 2 }, { onlyIfMatch: stale as string });
  const after = (await store.get(KEY, { type: "json" })) as { round: number };

  return json({
    etag_present: Boolean(stale),
    current_tag_modified: a.modified,
    stale_tag_modified: b.modified,
    value_left: after?.round,
    enforced: a.modified === true && b.modified === false && after?.round === 1,
  });
}
