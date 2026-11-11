/** HTTP helpers shared by the API modules. */

export type Json = Record<string, unknown> | unknown[] | null;

export const NO_STORE = { "Cache-Control": "no-store" };

export const json = (body: Json, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30", ...init.headers },
  });

/** Error carried to the router: `code` is a stable English id; `fields` holds pt-BR form messages. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string>
  ) {
    super(code);
  }
}

export const errorResponse = (e: HttpError, headers: HeadersInit = {}) =>
  json({ error: e.code, ...(e.fields ? { fields: e.fields } : {}) }, { status: e.status, headers: { ...NO_STORE, ...headers } });

/** Parses a JSON object body (≤ `max` bytes, `Content-Type: application/json` — which also forces a CORS preflight). */
export async function readJson(request: Request, max = 16_000): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "json_required");
  // Refuse big bodies before reading them (a missing length is checked after reading, in bytes).
  if (Number(request.headers.get("Content-Length") ?? 0) > max) throw new HttpError(413, "too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > max) throw new HttpError(413, "too_large");
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "bad_json");
}

export function allowedOrigins(list: string | undefined): string[] {
  return (list ?? "").split(",").map((o) => o.trim()).filter(Boolean);
}
