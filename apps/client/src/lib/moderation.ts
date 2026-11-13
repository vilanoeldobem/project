/**
 * Moderation mode in the game (IMPL-0021): the narrow exception to "the admin UI lives only in the dashboard".
 * A signed-in administrator turns the mode on (off on every page load) and only then sees moderation *actions*:
 * on the house of a published NGO (`lib/ngo-moderation.ts`) and, PROPOSTA, on another visitor of the room. Lists,
 * review queues and the audit stay in the dashboard.
 *
 * What the game hides is convenience: the API checks the role on every call. Still, nothing here is reachable
 * for anybody else: the mode cannot be turned on without the role, and it goes off the moment the account signs
 * out, changes, is blocked or loses the role.
 */
import { create } from "zustand";

import type { Me } from "@vila/shared/accounts/contract";
import { ApiError, errorText } from "@vila/shared/accounts/errors";

import { onPresenceEvent, presenceLink, remotes } from "../net/multiplayer";
import { pickAvatar, type Vec3 } from "../net/pick";
import { createRemover, type RemovalResult } from "../net/removal";
import { useVila } from "../game/store";
import { sim } from "../game/sim";
import { api, useAccount } from "./account";

/** Only a signed-in administrator whose account is not blocked moderates. */
export const canModerate = (user: Me | null): boolean => user?.role === "admin" && !user.blocked;

/** What every moderation control asks before it renders: the mode is on AND the account may moderate. */
export const moderating = (user: Me | null, on: boolean): boolean => on && canModerate(user);

/** The result of the last removal, for the live region: `ok` only when the room confirmed it. */
export interface RemovalNotice {
  ok: boolean;
  text: string;
}

interface ModerationState {
  /** Moderation mode. Off on every page load; `setOn(true)` is refused unless the account may moderate. */
  on: boolean;
  /** The visitor picked for removal: an anonymous connection id of this room, or null. */
  selected: number | null;
  /** The confirmation step of the removal is on screen since this instant (null = not asked). */
  askedAt: number | null;
  /** A removal is waiting for the room's answer. */
  sending: boolean;
  notice: RemovalNotice | null;
  setOn: (on: boolean) => void;
  /** Picks a visitor of the room (null clears). Ignored outside moderation mode or with the removal flag off. */
  select: (id: number | null) => void;
  /** Picks the next visitor by distance from the administrator's avatar (the keyboard way to pick). */
  selectNext: () => void;
  /** Opens the confirmation step for the selected visitor. */
  ask: () => void;
  cancel: () => void;
  /** Sends the removal of the selected visitor (the confirmation step was answered). */
  confirm: () => Promise<void>;
}

const CLEAR = { selected: null, askedAt: null, sending: false, notice: null } as const;

/** The mode is on, the account may moderate and the API has visitor removal on (PROPOSTA). */
const removalOn = (): boolean => {
  const account = useAccount.getState();
  return account.presenceModeration && moderating(account.user, useModeration.getState().on);
};

const FAILED = "Não foi possível remover agora.";

/** What the administrator reads after a removal: "removido" only when the room said so. */
export function removalText(target: number, result: RemovalResult): string {
  if (result.ok) return `Visitante nº ${target} removido da sala.`;
  switch (result.reason) {
    case "busy":
      return "Aguarde a resposta da remoção anterior.";
    case "limit":
      return `${FAILED} Você chegou ao limite de remoções por minuto; espere um pouco.`;
    case "offline":
      return `${FAILED} Você não está conectado a uma sala.`;
    case "waiting":
      return `${FAILED} A sala ainda não respondeu ao pedido anterior; espere a resposta antes de tentar de novo.`;
    case "left":
      return `O visitante nº ${target} já saiu da sala: nenhum pedido de remoção foi enviado.`;
    case "ticket_timeout":
      return `${FAILED} A Vila não respondeu a tempo; nada foi enviado à sala.`;
    case "closed":
      return `${FAILED} A conexão com a sala caiu antes da resposta.`;
    case "refused":
      return `${FAILED} A sala não removeu ninguém: o visitante pode já ter saído, ou a sala acabou de abrir.`;
    case "timeout":
      return `${FAILED} A sala não respondeu a tempo.`;
    case "ticket":
      return result.error instanceof ApiError ? `${FAILED} ${ticketErrorText(result.error)}` : FAILED;
  }
}

/** The sentence for a ticket the API refused (the flag off answers 404). */
const ticketErrorText = (e: ApiError): string => (e.code === "not_found" ? "A remoção de visitantes está desligada." : errorText(e));

let remove: ((target: number) => Promise<RemovalResult>) | null = null;
/** One remover per page (its counters keep the page inside the room's limits), wired to the live connection. */
const remover = () =>
  (remove ??= createRemover({
    ticket: api.moderationTicket,
    link: presenceLink,
    listen: onPresenceEvent,
    // The room confirmed after this page had already said "não foi possível": correct it.
    onLateRemoval: (target) => useVila.getState().notify(`O visitante nº ${target} foi removido da sala (a resposta chegou atrasada).`),
  }));

export const useModeration = create<ModerationState>((set, get) => ({
  on: false,
  ...CLEAR,
  setOn: (on) => set({ on: on && canModerate(useAccount.getState().user), ...CLEAR }),
  select: (id) => {
    if (get().sending) return;
    if (id === null) return set({ selected: null, askedAt: null });
    if (!removalOn() || !remotes.has(id)) return;
    set({ selected: id, askedAt: null, notice: null });
  },
  selectNext: () => {
    const { x, z } = sim.pose;
    const order = [...remotes.values()].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z) || a.id - b.id).map((r) => r.id);
    if (!order.length) return get().select(null);
    const selected = get().selected;
    get().select(order[(selected === null ? 0 : order.indexOf(selected) + 1) % order.length]);
  },
  ask: () => {
    if (get().selected === null || get().sending || !removalOn()) return;
    set({ askedAt: Date.now(), notice: null });
  },
  cancel: () => {
    if (!get().sending) set({ askedAt: null });
  },
  confirm: async () => {
    const target = get().selected;
    if (target === null || get().askedAt === null || get().sending || !removalOn()) return;
    set({ sending: true, askedAt: null, notice: null });
    const result = await remover()(target);
    // The mode went off meanwhile (signed out, role lost): say nothing about a screen that is gone.
    if (!get().on) return;
    set({ sending: false, notice: { ok: result.ok, text: removalText(target, result) }, selected: result.ok || !remotes.has(target) ? null : target });
  },
}));

// The selected visitor left, or the connection went away: there is nobody to remove any more.
onPresenceEvent((e) => {
  const { selected, sending } = useModeration.getState();
  if (selected === null || sending) return;
  if (e.type === "closed") useModeration.setState({ selected: null, askedAt: null });
  else if (e.type === "left" && e.id === selected)
    useModeration.setState({ selected: null, askedAt: null, notice: { ok: false, text: `O visitante nº ${selected} saiu da sala.` } });
});

// Signed out, another account, blocked, or no longer an administrator: the mode and everything in it go away.
useAccount.subscribe((s, prev) => {
  if (useModeration.getState().on && (!canModerate(s.user) || s.user?.id !== prev.user?.id)) useModeration.setState({ on: false, ...CLEAR });
});

/**
 * A click on the scene in moderation mode: true when it picked another visitor (the click then does not walk).
 * Outside moderation mode, or with visitor removal off, it never picks: the click walks as always.
 */
export function selectVisitorAt(origin: Vec3, direction: Vec3): boolean {
  if (!removalOn() || useModeration.getState().sending) return false;
  const id = pickAvatar(origin, direction, remotes.values());
  if (id === null) return false;
  useModeration.getState().select(id);
  return true;
}
