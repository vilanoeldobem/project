/** Tokens and hashing (Web Crypto: same code in Workers and in Node tests). */

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Random token, URL-safe: 256 bits by default (43 characters); 24 bytes give 192 bits in exactly 32 characters. */
export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const newId = () => crypto.randomUUID();

/** ISO timestamp `ms` from now (D1 compares ISO strings lexicographically). */
export const isoIn = (ms: number, now = Date.now()) => new Date(now + ms).toISOString();
