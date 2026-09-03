import { json } from "@/lib/http";

/** Temporary: how many writers can win the same version tag at once? */
export async function GET(req: Request) {
  const racers = Number(new URL(req.url).searchParams.get("n") ?? 8);
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "cas-probe", consistency: "strong" });
  const KEY = "probe.json";

  await store.setJSON(KEY, { round: 0 });
  const first = await store.getWithMetadata(KEY, { type: "text" });
  const shared = first?.etag as string;

  // Every one of these claims the same tag. Exactly one should be allowed.
  const results = await Promise.all(
    Array.from({ length: racers }, (_, i) =>
      store
        .setJSON(KEY, { round: i + 1 }, { onlyIfMatch: shared })
        .then((r) => r.modified)
        .catch(() => "threw"),
    ),
  );

  const winners = results.filter((r) => r === true).length;
  return json({
    racers,
    winners,
    atomic: winners === 1,
    results,
  });
}
