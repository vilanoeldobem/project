/**
 * The ONG invite (P11): the editable message and the three ways to share it. Pure — the panel owns the text
 * state and the clipboard. `link` is the public website (SERVICES.site): the invite tells an organisation where
 * the Vila is, it does not apply on anyone's behalf.
 */
export const INVITE_MESSAGE = "Olá! Conheça a Vila Noel do Bem e saiba como sua ONG pode participar.";

export interface InviteLinks {
  /** The message followed by the link, as WhatsApp and e-mail carry it. */
  text: string;
  link: string;
  /** `https://wa.me/?text=…` */
  whatsapp: string;
  /** `mailto:?subject=…&body=…` */
  email: string;
}

/** The message is trimmed; an empty message sends the link alone (no lone blank line). */
export function inviteLinks(message: string, link: string): InviteLinks {
  const body = message.trim();
  const text = body ? `${body}\n\n${link}` : link;
  return {
    text,
    link,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    email: `mailto:?subject=${encodeURIComponent("Convite: Vila Noel do Bem")}&body=${encodeURIComponent(text)}`,
  };
}
