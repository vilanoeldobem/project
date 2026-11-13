/**
 * Roles and account block as the dashboard offers them (IMPL-0021). Pure: which actions a row of the accounts
 * list offers and why not the others, what each confirmation says, and how one action is sent and answered.
 *
 * The API decides everything again on every request; what is not offered here is convenience, not protection.
 * Account block is PROPOSTA: the sanction policy is an open product question (OQ-11), so the block is offered
 * only when `/config` says `moderation.block`. Lifting a block is always offered: nobody stays blocked without
 * a way out because a flag was turned off.
 */
import type { UserSummary } from "@vila/shared/accounts/contract";
import { errorText } from "@vila/shared/accounts/errors";
import { BLOCK_MESSAGE_ERROR, BLOCK_MESSAGE_MAX, BLOCK_MESSAGE_MIN, cleanBlockMessage } from "@vila/shared/accounts/moderation";

import type { Api } from "./api";
import { roleLabel } from "./format";

export type UserAction = "promote" | "demote" | "block" | "unblock";

/** The button of each action. */
export const USER_ACTION_LABEL: Record<UserAction, string> = {
  promote: "Tornar administrador",
  demote: "Tornar padrão",
  block: "Bloquear conta",
  unblock: "Desbloquear",
};

export const OWN_ROLE_NOTE = "Você não pode mudar o próprio papel.";
export const OWN_BLOCK_NOTE = "Também não pode bloquear a própria conta.";
export const ADMIN_BLOCK_NOTE = "Remova o papel de administrador antes de bloquear esta conta.";
export const BLOCKED_ROLE_NOTE = "Desbloqueie a conta antes de torná-la administradora.";

/** The label of the message field of a block, and what the person who writes it must know. */
export const BLOCK_MESSAGE_LABEL = "Mensagem para a pessoa (ela vai ler)";
export const BLOCK_MESSAGE_HINT = `De ${BLOCK_MESSAGE_MIN} a ${BLOCK_MESSAGE_MAX} caracteres. A pessoa lê este texto como foi escrito, ao tentar entrar. Não é uma anotação interna: não cite terceiros nem dados pessoais.`;

export interface Offer {
  actions: UserAction[];
  /** Why an action is missing from this row (pt-BR sentences). */
  notes: string[];
}

/**
 * What the row of `user` offers to the administrator `selfId`. `blockOn` is `/config.moderation.block`.
 *   - own row: nothing (nobody changes their own role or blocks their own account);
 *   - an administrator: can be made "Padrão", never blocked (the role goes first);
 *   - a blocked account: can only be unblocked (the API refuses to promote it);
 *   - anyone else: can be made administrator and, with the flag on, blocked.
 * Without `selfId` nothing can be sent (every request names the signed-in account), so nothing is offered.
 */
export function offerFor(user: UserSummary, selfId: string | undefined, blockOn: boolean): Offer {
  if (!selfId) return { actions: [], notes: [] };
  if (user.id === selfId) return { actions: [], notes: blockOn ? [OWN_ROLE_NOTE, OWN_BLOCK_NOTE] : [OWN_ROLE_NOTE] };
  const admin = user.role === "admin";
  if (user.blocked) return admin ? { actions: ["demote", "unblock"], notes: [] } : { actions: ["unblock"], notes: [BLOCKED_ROLE_NOTE] };
  if (admin) return { actions: ["demote"], notes: blockOn ? [ADMIN_BLOCK_NOTE] : [] };
  return { actions: blockOn ? ["promote", "block"] : ["promote"], notes: [] };
}

export interface Confirmation {
  /** Names the account. */
  title: string;
  /** What happens if the administrator goes ahead. */
  effect: string;
  /** The sentence the administrator ticks before the button works. */
  understood: string;
}

export function confirmationOf(action: UserAction, nickname: string): Confirmation {
  const who = `@${nickname}`;
  switch (action) {
    case "promote":
      return {
        title: `Tornar ${who} administrador?`,
        effect: `${who} terá acesso a este painel e poderes de moderação no jogo. A mudança fica registrada na auditoria.`,
        understood: `Confirmo que ${who} deve ser administrador`,
      };
    case "demote":
      return {
        title: `Tornar ${who} padrão?`,
        effect: `${who} perderá o acesso a este painel e os poderes de moderação no jogo. A conta continua existindo e a sessão da pessoa não é encerrada. A mudança fica registrada na auditoria.`,
        understood: `Confirmo que ${who} deve deixar de ser administrador`,
      };
    case "block":
      return {
        title: `Bloquear a conta de ${who}?`,
        effect: `Todas as sessões de ${who} são encerradas. Ao entrar de novo, a pessoa só consegue ler a mensagem abaixo, sair e excluir a própria conta. O bloqueio não tem prazo: vale até um administrador desbloquear. A auditoria registra o bloqueio, nunca o texto da mensagem.`,
        understood: `Confirmo o bloqueio e sei que ${who} vai ler esta mensagem`,
      };
    case "unblock":
      return {
        title: `Desbloquear a conta de ${who}?`,
        effect: `${who} volta a usar a conta normalmente e deixa de ver a mensagem do bloqueio. A mudança fica registrada na auditoria.`,
        understood: `Confirmo o desbloqueio de ${who}`,
      };
  }
}

/** Refusals that mean the list on screen is out of date: read it (and the flags) again. */
const STALE = new Set(["bad_transition", "account_blocked", "admin_account", "last_admin", "not_found"]);

/** Sentences for the refusals the shared list has no sentence for, in the words of this screen. */
const LOCAL_TEXT: Record<string, string> = {
  not_found: "Esta conta não existe mais, ou esta ação foi desligada nesta API. A lista foi lida de novo.",
};

/** The sentence shown for a refused action: the API's own sentence for its code whenever there is one. */
export const userRefusalText = (error: unknown): string => LOCAL_TEXT[(error as { code?: string }).code ?? ""] ?? errorText(error);

export type UserActionResult =
  /** Done. `user` is the row as the API has it now; `done` is the sentence to announce. */
  | { ok: true; user: UserSummary; done: string }
  /**
   * Not done. `message` is the sentence to show (empty when only the field is wrong); `field` is the error of the
   * message field; `stale` means the row changed while the screen was open: read the list again.
   */
  | { ok: false; message: string; field: string; stale: boolean };

/** What the screen says when the API answered 200 without the row: the action may or may not have been done. */
export const NO_ROW_TEXT = `${errorText(null)} A lista foi lida de novo: confira como a conta ficou.`;

/** The API answered without the row of the account that was asked about. */
class NoRow extends Error {}

/**
 * The row in a successful answer. An answer without the row of `id` says nothing about what was done: it is a
 * failure, and it never reaches the list on screen.
 */
function rowOf(answer: { user?: UserSummary } | null | undefined, id: string): UserSummary {
  const row = answer?.user;
  if (!row || typeof row !== "object" || row.id !== id) throw new NoRow();
  return row;
}

/**
 * Sends one action about the account in `user`, in the name of the signed-in administrator `accountId`. A block
 * message that does not fit the shared rule is refused here, without a request (the API applies the same rule).
 */
export async function sendUserAction(
  api: Pick<Api, "adminSetRole" | "adminBlock" | "adminUnblock">,
  action: UserAction,
  user: UserSummary,
  accountId: string,
  message = ""
): Promise<UserActionResult> {
  const who = `@${user.nickname}`;
  try {
    if (action === "block") {
      const text = cleanBlockMessage(message);
      if (!text) return { ok: false, message: "", field: BLOCK_MESSAGE_ERROR, stale: false };
      const now = rowOf(await api.adminBlock(user.id, accountId, text), user.id);
      return { ok: true, user: now, done: `Conta de ${who} bloqueada. As sessões dela foram encerradas.` };
    }
    if (action === "unblock") {
      const now = rowOf(await api.adminUnblock(user.id, accountId), user.id);
      return { ok: true, user: now, done: `Conta de ${who} desbloqueada.` };
    }
    const now = rowOf(await api.adminSetRole(user.id, accountId, action === "promote" ? "admin" : "player"), user.id);
    return { ok: true, user: now, done: `Papel alterado: ${who} agora é ${roleLabel(now.role)}.` };
  } catch (error) {
    // The request was accepted but the answer does not say what the account is now: read the list again.
    if (error instanceof NoRow) return { ok: false, message: NO_ROW_TEXT, field: "", stale: true };
    const { code = "", fields = {} } = error as { code?: string; fields?: Record<string, string> };
    return { ok: false, message: userRefusalText(error), field: fields.message ?? "", stale: STALE.has(code) };
  }
}

/** The list with the row of `user` replaced by what the API answered (a list without that row is unchanged). */
export const withUser = (users: UserSummary[], user: UserSummary): UserSummary[] => users.map((u) => (u.id === user.id ? user : u));
