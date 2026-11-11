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
  // Refuse big bodies before reading them; without a length, stop reading as soon as the limit is passed.
  if (Number(request.headers.get("Content-Length") ?? 0) > max) throw new HttpError(413, "too_large");
  const text = await readCapped(request, max);
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "bad_json");
}

/** Reads the body as UTF-8 text, aborting once more than `max` bytes arrived (never buffers a huge body). */
async function readCapped(request: Request, max: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Every response that may carry personal data (all account routes, errors included) is never cached. */
export function noStore(res: Response): Response {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function allowedOrigins(list: string | undefined): string[] {
  return (list ?? "").split(",").map((o) => o.trim()).filter(Boolean);
}
