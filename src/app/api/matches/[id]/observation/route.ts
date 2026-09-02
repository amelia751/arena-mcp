import { getObservation } from "@/lib/match-service";
import { fromResult } from "@/lib/http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const seat = new URL(req.url).searchParams.get("seat");
  return fromResult(await getObservation(id, seat ? Number(seat) : undefined));
}
