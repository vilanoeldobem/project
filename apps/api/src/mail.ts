/**
 * Transactional e-mail through Resend's HTTPS API (IMPL-0012, replaces the Cloudflare Email Service binding).
 * Only one message exists: the sign-in link. pt-BR, plain and HTML, no tracking, no marketing.
 * Addresses, links and the API key are never logged.
 */
import { HttpError } from "./http";
import type { Env } from "./api";

const RESEND_URL = "https://api.resend.com/emails";
/** Resend rejects requests without a User-Agent (403), and Workers' fetch does not send one by default. */
const USER_AGENT = "vilanoeldobem-api";
const SEND_TIMEOUT_MS = 8000;
const DEFAULT_FROM = "acesso@vilanoeldobem.com.br";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Where the link opens: the game, or the backoffice dashboard for an admin who asked from it (IMPL-0015). */
export type LinkTarget = "game" | "dash";

export function loginEmail(link: string, nickname: string, target: LinkTarget = "game") {
  const subject = "Seu link para entrar na Vila Noel do Bem";
  const place = target === "dash" ? "no painel administrativo da Vila Noel do Bem" : "na Vila Noel do Bem";
  const text = [
    `Olá, ${nickname}!`,
    "",
    `Use o link abaixo para entrar ${place}. Ele vale por 15 minutos e só funciona uma vez:`,
    link,
    "",
    "Se não foi você que pediu, é só ignorar este e-mail.",
    "",
    "Vila Noel do Bem",
  ].join("\n");
  const html = `<p>Olá, ${escape(nickname)}!</p>
<p>Use o botão abaixo para entrar ${place}. Ele vale por 15 minutos e só funciona uma vez.</p>
<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;background:#173D35;color:#FFF9ED;border-radius:10px;text-decoration:none;font-weight:700">${target === "dash" ? "Entrar no painel" : "Entrar na Vila"}</a></p>
<p style="color:#555">Se não foi você que pediu, é só ignorar este e-mail.</p>
<p>Vila Noel do Bem</p>`;
  return { subject, text, html };
}

/** True when the Worker has a Resend API key (secret `RESEND_API_KEY`); reported by `GET /health` as `mail`. */
export const mailConfigured = (env: Env) => Boolean(env.RESEND_API_KEY);

/**
 * Fail closed: the link is handed back to the caller (instead of only by e-mail) solely when the deployment
 * explicitly says it is local development or a test. A missing, misspelled or new environment name
 * ("staging") never returns it — returning it would let anyone sign in as anyone.
 */
const linkVisibleToCaller = (env: Env) => env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test";

/** Resend's machine-readable error name (`validation_error`, `rate_limit_exceeded`, …); never the message. */
async function errorName(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { name?: unknown } | null;
  return typeof body?.name === "string" && /^[a-z_]{1,64}$/.test(body.name) ? body.name : "unknown";
}

/** Sends the sign-in link; returns it only in development/test (see `linkVisibleToCaller`). */
export async function sendLoginLink(env: Env, to: string, nickname: string, link: string, target: LinkTarget = "game"): Promise<string | undefined> {
  if (!mailConfigured(env)) {
    if (!linkVisibleToCaller(env)) throw new HttpError(503, "mail_unavailable");
    return link;
  }
  const { subject, text, html } = loginEmail(link, nickname, target);
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ from: `Vila Noel do Bem <${env.MAIL_FROM || DEFAULT_FROM}>`, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    // Network failure or timeout: log the error class only (never the address or the link).
    console.error("mail_error", "network", e instanceof Error ? e.name : "unknown");
    throw new HttpError(503, "mail_unavailable");
  }
  if (!res.ok) {
    console.error("mail_error", res.status, await errorName(res));
    throw new HttpError(503, "mail_unavailable");
  }
  return linkVisibleToCaller(env) ? link : undefined;
}
