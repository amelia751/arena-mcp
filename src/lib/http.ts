export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fromResult<T extends { error?: string; status?: number }>(result: T) {
  if (result && result.error) {
    return json(result, result.status ?? 400);
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
