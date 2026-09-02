import { publishEnv } from "@/lib/env-service";
import { fromResult, readBody } from "@/lib/http";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await readBody<{ expected_revision: number; confirm_info_flow?: boolean }>(req);
  return fromResult(
    await publishEnv({
      id,
      expected_revision: body.expected_revision,
      confirm_info_flow: body.confirm_info_flow,
    }),
  );
}
