/**
 * Rules of the moderation routes (IMPL-0021, PROPOSTA) shared by the API, which enforces them, and the browser
 * apps, which check before sending. Pure: no fetch, no DOM.
 */

/** The message to a blocked person: 10 to 1000 characters after trimming (counted as Unicode code points). */
export const BLOCK_MESSAGE_MIN = 10;
export const BLOCK_MESSAGE_MAX = 1000;

/** UI copy for a block message that does not fit; the API sends it as `fields.message`. */
export const BLOCK_MESSAGE_ERROR = `Escreva a mensagem para a pessoa (${BLOCK_MESSAGE_MIN} a ${BLOCK_MESSAGE_MAX} caracteres). Ela lê este texto.`;

/** The trimmed message, or null when it does not fit the rule. */
export function cleanBlockMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  // Same count as SQLite's length(): code points; an embedded NUL would truncate its count.
  const length = Array.from(text).length;
  return text.includes("\0") || length < BLOCK_MESSAGE_MIN || length > BLOCK_MESSAGE_MAX ? null : text;
}

/** A moderation ticket: 32 URL-safe characters (192 random bits), single use. */
export const MODERATION_TICKET = /^[A-Za-z0-9_-]{32}$/;
/** How long a ticket lives. The realtime server relies on it too: keep the two in step (IMPL-0021). */
export const MODERATION_TICKET_TTL_MS = 30_000;
/** Tickets one administrator may ask for per minute. */
export const MODERATION_TICKETS_PER_MINUTE = 10;
