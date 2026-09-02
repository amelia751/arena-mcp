export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function fromResult(result: unknown) {
  if (result && typeof result === "object" && "error" in result) {
    const row = result as { error?: string; status?: number };
    if (row.error) return json(result, typeof row.status === "number" ? row.status : 400);
  }
  return json(result);
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
