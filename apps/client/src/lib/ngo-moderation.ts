/**
 * Moderation actions on the house of a published NGO (IMPL-0021), for an administrator in moderation mode:
 * remove the logo, remove a photo of the public gallery, withdraw the NGO from the village (IMPL-0020, PROPOSTA).
 * The API already has and audits all three; this is the state behind the lot panel, with no React and no DOM.
 *
 * Every action goes through the same steps: read the application through the admin API (its current `revision`
 * and what it has), show a confirmation that names the organisation, send the revision that was on screen. A
 * `stale_revision` answer means the application changed meanwhile: it is read again and the confirmation is
 * asked again, never resent by itself. Only the actions that can work are offered (`availableActions`).
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import type { ApplicationDetail } from "@vila/shared/accounts/contract";
import { ApiError, errorText } from "@vila/shared/accounts/errors";

import type { AdminPhoto } from "./account";
import type { GalleryPhoto } from "./api";

export type NgoAction = { kind: "logo" } | { kind: "photo"; photoId: string } | { kind: "withdraw" };

/** A photo of the public gallery with the revision its removal has to name. */
export interface ModerationPhoto extends GalleryPhoto {
  revision: number;
}

/** The message to the organisation: 10 to 1000 characters (the API is the authority and repeats the check). */
export const WITHDRAW_MESSAGE_MIN = 10;
export const WITHDRAW_MESSAGE_MAX = 1000;
export const PHOTOS_FAILED = "Não foi possível ler as fotos agora.";
export const WITHDRAW_MESSAGE_ERROR = `Escreva a mensagem para a organização (${WITHDRAW_MESSAGE_MIN} a ${WITHDRAW_MESSAGE_MAX} caracteres). Ela lê este texto.`;
export const withdrawMessageFits = (text: string): boolean => {
  const length = Array.from(text.trim()).length;
  return length >= WITHDRAW_MESSAGE_MIN && length <= WITHDRAW_MESSAGE_MAX;
};

export interface NgoModerationState {
  /** "loading" until the first read ends; "failed" when the admin API could not be read (`notice` says why). */
  status: "loading" | "ready" | "failed";
  detail: ApplicationDetail | null;
  photos: ModerationPhoto[];
  /**
   * The village shows photos of this NGO but the admin API could not say which can be removed: `photos` is empty
   * because it is unknown, not because there is nothing to act on. The screen says so and offers to read again.
   */
  photosFailed: boolean;
  /** The confirmation step on screen and when it appeared (it re-arms every time it is asked again). */
  asking: { action: NgoAction; at: number } | null;
  busy: boolean;
  /** Result of the last step, for the live region. */
  notice: { tone: "ok" | "error" | "info"; text: string } | null;
  /** The API's sentence about the withdrawal message, when it refused it. */
  messageError: string;
}

export interface NgoModerationDeps {
  api: {
    adminApplication: (ngoId: string) => Promise<ApplicationDetail>;
    adminPhotos: (ngoId: string) => Promise<{ photos: AdminPhoto[] }>;
    adminRemoveLogo: (ngoId: string, revision: number) => Promise<unknown>;
    adminRemovePhoto: (photoId: string, revision: number) => Promise<unknown>;
    adminWithdraw: (ngoId: string, revision: number, message: string) => Promise<unknown>;
  };
  /** The public gallery (`fetchGallery`): what the village shows; empty with photos off, null when unreadable. */
  gallery: (ngoId: string) => Promise<GalleryPhoto[] | null>;
  /** `/config` as the page read it. */
  flags: () => { files: boolean; withdrawal: boolean };
  /** Nickname of the signed-in administrator: nobody acts as the administration on their own organisation. */
  nickname: () => string;
  /** Something the village shows changed: read the lots again. */
  onChanged: () => void;
  /** The NGO was withdrawn: its house leaves the panel, so the result is also told outside it. */
  onWithdrawn?: (text: string) => void;
  now?: () => number;
}

export interface NgoModeration {
  store: StoreApi<NgoModerationState>;
  load: () => Promise<void>;
  /** Reads the application and the gallery again (the retry of a failed photo read); what is on screen stays. */
  reload: () => Promise<void>;
  /** Reads the application again, then shows the confirmation step of `action` if it can still work. */
  ask: (action: NgoAction) => Promise<void>;
  cancel: () => void;
  /** The confirmation step was answered: send `action` for the revision on screen (`message`: withdrawal only). */
  confirm: (message?: string) => Promise<void>;
}

/** Why no action is offered at all, or null. */
export function blockedReason(detail: ApplicationDetail, nickname: string): string | null {
  if (detail.applicant && detail.applicant.nickname.toLowerCase() === nickname.toLowerCase())
    return "Você é responsável por esta organização: outro administrador precisa agir sobre ela.";
  if (detail.applicant?.deletionPending) return "A exclusão da conta do responsável está em andamento: as ações ficam indisponíveis até ela terminar.";
  return null;
}

/** The actions that can work right now for what was read, following `/config`. */
export function availableActions(
  state: Pick<NgoModerationState, "detail" | "photos">,
  flags: { files: boolean; withdrawal: boolean },
  nickname: string
): { logo: boolean; withdraw: boolean; photos: ModerationPhoto[] } {
  const { detail } = state;
  if (!detail || blockedReason(detail, nickname)) return { logo: false, withdraw: false, photos: [] };
  return {
    logo: flags.files && detail.files.some((f) => f.kind === "logo"),
    withdraw: flags.withdrawal && detail.application.status === "published",
    photos: state.photos,
  };
}

const canStill = (action: NgoAction, can: ReturnType<typeof availableActions>): boolean =>
  action.kind === "logo" ? can.logo : action.kind === "withdraw" ? can.withdraw : can.photos.some((p) => p.id === action.photoId);

/** Sentences for refusals the shared list does not have, or has for another screen. */
const REFUSAL: Record<string, string> = {
  self_review: "Você é responsável por esta organização: outro administrador precisa fazer esta ação.",
  not_found: "Isto não está mais disponível: pode já ter sido removido, ou a função está desligada.",
  account_deleting: "A exclusão da conta do responsável por esta organização está em andamento. Tente de novo quando ela terminar.",
  files_unavailable: "O armazenamento dos arquivos está indisponível agora. Tente de novo mais tarde.",
  photos_unavailable: "O armazenamento das fotos está indisponível agora. Tente de novo mais tarde.",
  file_cleanup_pending: "O logo já saiu da Vila, mas a remoção do arquivo guardado ainda não terminou.",
  photo_cleanup_pending: "A foto já saiu da galeria, mas a remoção do arquivo ainda não terminou. Tente remover de novo mais tarde.",
  stale_revision: "A candidatura mudou enquanto esta tela estava aberta. Confira a versão atual e confirme de novo.",
};
/** The sentence shown for a refused moderation call (UI copy, pt-BR). */
export const refusalText = (e: unknown): string => (e instanceof ApiError && (e.fields.reason ?? REFUSAL[e.code])) || errorText(e);

const code = (e: unknown): string => (e instanceof ApiError ? e.code : "");
/** The change was recorded and only the stored file is left to delete: the village already shows the result. */
const DONE_BUT_PENDING = new Set(["file_cleanup_pending", "photo_cleanup_pending"]);

const DONE: Record<NgoAction["kind"], (name: string) => string> = {
  logo: (name) => `Logo de ${name} removido.`,
  photo: (name) => `Foto removida da galeria de ${name}.`,
  withdraw: (name) => `${name} foi retirada da Vila: a casa saiu e o terreno foi liberado.`,
};

export function createNgoModeration(ngoId: string, deps: NgoModerationDeps): NgoModeration {
  const now = deps.now ?? Date.now;
  const store = createStore<NgoModerationState>(() => ({
    status: "loading",
    detail: null,
    photos: [],
    photosFailed: false,
    asking: null,
    busy: false,
    notice: null,
    messageError: "",
  }));
  const set = store.setState;

  /**
   * The gallery the village shows, each photo with its admin revision. No public photo, no admin read. A failed
   * admin read is told (`failed`), never taken for "no photo".
   */
  async function readPhotos(): Promise<{ photos: ModerationPhoto[]; failed: boolean }> {
    const shown = await deps.gallery(ngoId);
    if (!shown?.length) return { photos: [], failed: false };
    const rows: AdminPhoto[] | null = await deps.api.adminPhotos(ngoId).then(
      (answer) => answer.photos,
      () => null
    );
    if (!rows) return { photos: [], failed: true };
    const photos = shown.flatMap((photo) => {
      const row = rows.find((p) => p.id === photo.id && p.status === "approved");
      return row ? [{ ...photo, revision: row.revision }] : [];
    });
    return { photos, failed: false };
  }

  /** Reads the application and the gallery again. Throws when the application cannot be read. */
  async function read(): Promise<Pick<NgoModerationState, "detail" | "photos">> {
    const [detail, gallery] = await Promise.all([deps.api.adminApplication(ngoId), readPhotos()]);
    set({ status: "ready", detail, photos: gallery.photos, photosFailed: gallery.failed });
    return { detail, photos: gallery.photos };
  }

  const can = (state: Pick<NgoModerationState, "detail" | "photos">) => availableActions(state, deps.flags(), deps.nickname());

  return {
    store,
    load: async () => {
      try {
        await read();
      } catch (e) {
        set({ status: "failed", notice: { tone: "error", text: refusalText(e) } });
      }
    },
    reload: async () => {
      if (store.getState().busy) return;
      set({ busy: true, notice: null });
      try {
        await read();
      } catch (e) {
        set({ notice: { tone: "error", text: refusalText(e) } });
      } finally {
        set({ busy: false });
      }
    },
    ask: async (action) => {
      if (store.getState().busy) return;
      set({ busy: true, notice: null, messageError: "" });
      try {
        const fresh = await read();
        if (canStill(action, can(fresh))) set({ asking: { action, at: now() } });
        else set({ asking: null, notice: { tone: "info", text: "Esta ação não está mais disponível: a organização mudou. Confira o que a tela mostra agora." } });
      } catch (e) {
        set({ asking: null, notice: { tone: "error", text: refusalText(e) } });
      } finally {
        set({ busy: false });
      }
    },
    cancel: () => {
      if (!store.getState().busy) set({ asking: null, messageError: "" });
    },
    confirm: async (message = "") => {
      const { asking, busy, detail, photos } = store.getState();
      if (!asking || busy || !detail) return;
      const { action } = asking;
      const name = detail.application.name;
      if (action.kind === "withdraw" && !withdrawMessageFits(message)) return set({ messageError: WITHDRAW_MESSAGE_ERROR });
      set({ busy: true, notice: null, messageError: "" });
      try {
        if (action.kind === "logo") await deps.api.adminRemoveLogo(ngoId, detail.application.revision);
        else if (action.kind === "withdraw") await deps.api.adminWithdraw(ngoId, detail.application.revision, message.trim());
        else {
          const photo = photos.find((p) => p.id === action.photoId);
          if (!photo) throw new ApiError(404, "not_found");
          await deps.api.adminRemovePhoto(photo.id, photo.revision);
        }
        const done = DONE[action.kind](name);
        set({ asking: null, notice: { tone: "ok", text: done } });
        if (action.kind === "withdraw") deps.onWithdrawn?.(done);
        deps.onChanged();
        // The result stays on screen even if this read fails; a withdrawn NGO has no house to read about.
        if (action.kind !== "withdraw") await read().catch(() => undefined);
      } catch (e) {
        if (code(e) === "reason_required") {
          // The message did not fit: the step stays, re-armed, with the API's sentence under the field.
          set({ asking: { action, at: now() }, messageError: refusalText(e) });
          return;
        }
        if (DONE_BUT_PENDING.has(code(e))) deps.onChanged();
        // Whatever was refused, show the application as it is now.
        const fresh = await read().catch(() => null);
        if (code(e) === "stale_revision" && fresh && canStill(action, can(fresh))) set({ asking: { action, at: now() }, notice: { tone: "info", text: refusalText(e) } });
        else set({ asking: null, notice: { tone: "error", text: refusalText(e) } });
      } finally {
        set({ busy: false });
      }
    },
  };
}
