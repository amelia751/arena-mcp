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

/**
 * Anything that writes can now fail loudly rather than pretend it saved. Turn
 * that into an answer the page and the agent can both read, instead of a crash.
 */
export async function fromWrite(work: () => Promise<unknown>) {
  try {
    return fromResult(await work());
  } catch (err) {
    const message = err instanceof Error ? err.message : "the write did not go through";
    return json({ error: message, status: 503 }, 503);
  }
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
