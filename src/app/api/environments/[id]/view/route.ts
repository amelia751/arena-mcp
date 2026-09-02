import { previewEnv } from "@/lib/env-service";
import { fromResult } from "@/lib/http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const seed = Number(url.searchParams.get("seed") ?? 0);
  const seat = Number(url.searchParams.get("seat") ?? 0);
  return fromResult(await previewEnv(id, Number.isFinite(seed) ? seed : 0, Number.isFinite(seat) ? seat : 0));
}
