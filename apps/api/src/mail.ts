/**
 * Transactional e-mail through Cloudflare Email Service (`send_email` binding, OQ-08 → IMPL-0011).
 * Only one message exists: the sign-in link. pt-BR, plain and HTML, no tracking, no marketing.
 * Addresses and links are never logged.
 */
import { HttpError } from "./http";
import type { Env } from "./api";

/** Shape of the Email Service binding (`env.EMAIL.send`). */
export interface EmailBinding {
  send(message: { from: string | { email: string; name?: string }; to: string; subject: string; text: string; html: string }): Promise<{ messageId: string }>;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function loginEmail(link: string, nickname: string) {
  const subject = "Seu link para entrar na Vila Noel do Bem";
  const text = [
    `Olá, ${nickname}!`,
    "",
    "Use o link abaixo para entrar na Vila Noel do Bem. Ele vale por 15 minutos e só funciona uma vez:",
    link,
    "",
    "Se não foi você que pediu, é só ignorar este e-mail.",
    "",
    "Vila Noel do Bem",
  ].join("\n");
  const html = `<p>Olá, ${escape(nickname)}!</p>
<p>Use o botão abaixo para entrar na Vila Noel do Bem. Ele vale por 15 minutos e só funciona uma vez.</p>
<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;background:#173D35;color:#FFF9ED;border-radius:10px;text-decoration:none;font-weight:700">Entrar na Vila</a></p>
<p style="color:#555">Se não foi você que pediu, é só ignorar este e-mail.</p>
<p>Vila Noel do Bem</p>`;
  return { subject, text, html };
}

/**
 * Fail closed: the link is handed back to the caller (instead of only by e-mail) solely when the deployment
 * explicitly says it is local development or a test. A missing, misspelled or new environment name
 * ("staging") never returns it — returning it would let anyone sign in as anyone.
 */
const linkVisibleToCaller = (env: Env) => env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test";

/** Sends the sign-in link; returns it only in development/test (see `linkVisibleToCaller`). */
export async function sendLoginLink(env: Env, to: string, nickname: string, link: string): Promise<string | undefined> {
  const mailer = env.EMAIL as EmailBinding | undefined;
  if (!mailer) {
    if (!linkVisibleToCaller(env)) throw new HttpError(503, "mail_unavailable");
    return link;
  }
  const { subject, text, html } = loginEmail(link, nickname);
  try {
    await mailer.send({ from: { email: env.MAIL_FROM ?? "acesso@vilanoeldobem.com.br", name: "Vila Noel do Bem" }, to, subject, text, html });
  } catch (e) {
    // Log the error code only (never the address or the link).
    console.error("mail_error", (e as { code?: string }).code ?? (e instanceof Error ? e.name : "unknown"));
    throw new HttpError(503, "mail_unavailable");
  }
  return linkVisibleToCaller(env) ? link : undefined;
}
