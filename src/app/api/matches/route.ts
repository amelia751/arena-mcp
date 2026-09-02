import { startMatch } from "@/lib/match-service";
import { json, readBody } from "@/lib/http";

export async function POST(req: Request) {
  const body = await readBody<{
    environment_id: string;
    seat?: number;
    agent_label?: string;
    seed?: number;
  }>(req);
  try {
    return json(await startMatch(body));
  } catch (e) {
    const err = e as Error & { status?: number };
    return json({ error: err.message }, err.status ?? 400);
  }
}
