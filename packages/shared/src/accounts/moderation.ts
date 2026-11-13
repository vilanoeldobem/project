/**
 * Rules of the moderation routes (IMPL-0021, PROPOSTA) shared by the API, which enforces them, and the browser
 * apps, which check before sending. Pure: no fetch, no DOM.
 */

/**
 * The message to a blocked person: 10 to 1000 characters (counted as Unicode code points) after removing what
 * nobody can see and trimming.
 */
export const BLOCK_MESSAGE_MIN = 10;
export const BLOCK_MESSAGE_MAX = 1000;

/** UI copy for a block message that does not fit; the API sends it as `fields.message`. */
export const BLOCK_MESSAGE_ERROR = `Escreva a mensagem para a pessoa (${BLOCK_MESSAGE_MIN} a ${BLOCK_MESSAGE_MAX} caracteres). Ela lê este texto.`;

/**
 * Format and control characters (Unicode categories Cf and Cc) other than a line break and a tab: zero-width
 * characters, direction overrides, the soft hyphen, a carriage return. They show nothing, or change the order in
 * which the rest is read, so they are neither counted nor kept.
 */
const UNSEEN = /(?![\n\t])[\p{Cc}\p{Cf}]/gu;

/** The message as it is stored and shown (unseen characters removed, trimmed), or null when it does not fit the rule. */
export function cleanBlockMessage(value: unknown): string | null {
  // An embedded NUL is refused, as before: it never comes from a form.
  if (typeof value !== "string" || value.includes("\0")) return null;
  const text = value.replace(UNSEEN, "").trim();
  // Same count as SQLite's length(): code points.
  const length = Array.from(text).length;
  return length < BLOCK_MESSAGE_MIN || length > BLOCK_MESSAGE_MAX ? null : text;
}

/** A moderation ticket: 32 URL-safe characters (192 random bits), single use. */
export const MODERATION_TICKET = /^[A-Za-z0-9_-]{32}$/;
/** How long a ticket lives. The realtime server relies on it too: keep the two in step (IMPL-0021). */
export const MODERATION_TICKET_TTL_MS = 30_000;
/** Tickets one administrator may ask for per minute. */
export const MODERATION_TICKETS_PER_MINUTE = 10;
