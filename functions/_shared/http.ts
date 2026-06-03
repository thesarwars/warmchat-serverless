/**
 * Tiny response helpers so every endpoint returns a consistent JSON shape.
 * Errors are `{ message }` to match what the frontend axios layer surfaces
 * (src/helpers/api.tsx reads `error.response`).
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function error(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ message, ...extra }, status);
}

/** Parse a JSON body, returning null on any malformed/empty input. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
