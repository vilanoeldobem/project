/**
 * Moderation of the house of a published NGO, on its lot panel (IMPL-0021): "Remover logo", remove a photo of
 * the public gallery, "Retirar ONG da Vila" (IMPL-0020, PROPOSTA) and the link to the application in the
 * dashboard. Rendered only for an administrator with moderation mode on; nobody else gets any of it, and nothing
 * is read from the admin API before that. The state lives in `lib/ngo-moderation.ts`; copy is pt-BR.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { type Me, STATUS_LABEL } from "@vila/shared/accounts/contract";

import { useVila } from "../game/store";
import { api, useAccount } from "../lib/account";
import { fetchGallery, fetchLogo } from "../lib/api";
import { moderating, useModeration } from "../lib/moderation";
import {
  availableActions,
  blockedReason,
  createNgoModeration,
  type NgoAction,
  type NgoModerationState,
  PHOTOS_FAILED,
  WITHDRAW_MESSAGE_MAX,
  WITHDRAW_MESSAGE_MIN,
  withdrawMessageFits,
} from "../lib/ngo-moderation";
import { SERVICES } from "../lib/services";
import { Field } from "./Account";
import { BlobImage } from "./BlobImage";
import { Confirm, useFocusReturn } from "./Confirm";
import { Status } from "./Panel";

/** The application of an NGO in the dashboard (apps/dash): only linked to, in a new tab. */
export const dashApplicationUrl = (ngoId: string): string => `${SERVICES.dash}/#applications/${ngoId}`;

/** The gate: nothing mounts, and nothing is read, unless an administrator has moderation mode on. */
export function LotModeration({ ngoId, name, onChanged }: { ngoId: string; name: string; onChanged: () => void }) {
  const user = useAccount((s) => s.user);
  const on = useModeration((s) => s.on);
  return moderating(user, on) && user ? <LotModerationLive key={ngoId} ngoId={ngoId} name={name} user={user} onChanged={onChanged} /> : null;
}

function LotModerationLive({ ngoId, name, user, onChanged }: { ngoId: string; name: string; user: Me; onChanged: () => void }) {
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const moderation = useMemo(
    () =>
      createNgoModeration(ngoId, {
        api,
        gallery: fetchGallery,
        flags: () => useAccount.getState(),
        nickname: () => useAccount.getState().user?.nickname ?? "",
        onChanged: () => changed.current(),
        onWithdrawn: (text) => useVila.getState().notify(text),
      }),
    [ngoId]
  );
  const state = useStore(moderation.store);
  const flags = { files: useAccount((s) => s.files), withdrawal: useAccount((s) => s.withdrawal) };
  const [message, setMessage] = useState("");
  useEffect(() => void moderation.load(), [moderation]);
  return (
    <LotModerationView
      on
      user={user}
      ngoId={ngoId}
      name={name}
      state={state}
      flags={flags}
      message={message}
      onMessage={setMessage}
      onAsk={(action) => void moderation.ask(action)}
      onRetry={() => void moderation.reload()}
      onCancel={moderation.cancel}
      onConfirm={() => void moderation.confirm(message)}
    />
  );
}

const QUESTION: Record<NgoAction["kind"], (name: string) => string> = {
  logo: (name) => `Remover o logo de ${name}?`,
  photo: (name) => `Remover esta foto da galeria de ${name}?`,
  withdraw: (name) => `Retirar ${name} da Vila?`,
};
const CONFIRM_LABEL: Record<NgoAction["kind"], (name: string) => string> = {
  logo: (name) => `Remover o logo de ${name}`,
  photo: (name) => `Remover a foto de ${name}`,
  withdraw: (name) => `Retirar ${name} da Vila`,
};

/** Pure view of the moderation section. Renders nothing unless `user` may moderate and the mode is `on`. */
export function LotModerationView({
  on,
  user,
  ngoId,
  name,
  state,
  flags,
  message,
  onMessage,
  onAsk,
  onRetry,
  onCancel,
  onConfirm,
}: {
  on: boolean;
  user: Me | null;
  ngoId: string;
  /** The public name of the house, used until the application is read. */
  name: string;
  state: NgoModerationState;
  flags: { files: boolean; withdrawal: boolean };
  message: string;
  onMessage: (text: string) => void;
  onAsk: (action: NgoAction) => void;
  /** Reads the application and the photos again (offered when the photos could not be read). */
  onRetry: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const step = state.asking ? `${state.asking.action.kind}:${state.asking.at}` : "";
  const shown = state.photos.map((p) => p.id).join();
  // A step that closes, or a photo that goes away, takes the focused button with it: back to the heading.
  useFocusReturn(heading, `${step}|${shown}|${state.busy}|${state.photosFailed}`);
  if (!moderating(user, on) || !user) return null;

  const { detail, asking, busy } = state;
  const organisation = detail?.application.name ?? name;
  const can = availableActions(state, flags, user.nickname);
  const blocked = detail ? blockedReason(detail, user.nickname) : null;
  const asked = asking?.action;
  const photo = asked?.kind === "photo" ? state.photos.find((p) => p.id === asked.photoId) : undefined;
  // The photos could not be read: whether there is something to act on is unknown, so neither is claimed.
  const photosFailed = state.photosFailed && !blocked;
  const nothing = state.status === "ready" && !blocked && !photosFailed && !can.logo && !can.withdraw && can.photos.length === 0;

  return (
    <section className="moderation" aria-labelledby="lot-moderation-title" aria-busy={busy} data-moderation="ngo">
      <h3 id="lot-moderation-title" tabIndex={-1} ref={heading}>
        Moderação <Status>Modo moderação</Status>
      </h3>
      {state.status === "loading" && <p className="note">Lendo a candidatura desta organização…</p>}
      {detail && (
        <p className="note">
          {STATUS_LABEL[detail.application.status]} · versão {detail.application.revision} da candidatura. Cada ação é registrada na auditoria.
        </p>
      )}
      {blocked && <p className="note">{blocked}</p>}
      {nothing && <p className="note">Nenhuma ação de moderação está disponível para esta casa agora.</p>}

      {asking && asked ? (
        <Confirm
          title={QUESTION[asked.kind](organisation)}
          confirmLabel={CONFIRM_LABEL[asked.kind](organisation)}
          busyLabel={asked.kind === "withdraw" ? "Retirando…" : "Removendo…"}
          busy={busy}
          blocked={asked.kind === "withdraw" && !withdrawMessageFits(message)}
          shownAt={asking.at}
          onConfirm={onConfirm}
          onCancel={onCancel}
        >
          {asked.kind === "logo" && <p>O logo sai da casa na Vila na hora e o arquivo é apagado. Não dá para desfazer.</p>}
          {asked.kind === "photo" && (
            <>
              {photo && <BlobImage className="moderation__photo" source={photo.url} load={fetchLogo} alt={photo.caption || "Foto da galeria"} />}
              <p>{photo?.caption ? `“${photo.caption}”. ` : ""}A foto sai da galeria pública e o arquivo é apagado. Não dá para desfazer.</p>
            </>
          )}
          {asked.kind === "withdraw" && (
            <>
              <p>
                <strong>PROPOSTA (IMPL-0020).</strong> A casa sai da Vila e o terreno fica disponível na hora. Não dá para desfazer pelo jogo nem pelo painel: a
                organização não volta a ser publicada, a conta do responsável não consegue enviar outra candidatura e o CNPJ continua em uso.
              </p>
              <Field
                label={`Mensagem para a organização (obrigatória, de ${WITHDRAW_MESSAGE_MIN} a ${WITHDRAW_MESSAGE_MAX} caracteres)`}
                hint="A organização lê este texto como foi escrito, na tela da candidatura. Não é uma anotação interna: não cite terceiros nem dados pessoais."
                error={state.messageError || undefined}
              >
                <textarea value={message} onChange={(e) => onMessage(e.target.value)} rows={3} maxLength={WITHDRAW_MESSAGE_MAX} disabled={busy} />
              </Field>
            </>
          )}
        </Confirm>
      ) : (
        <>
          {(can.logo || can.withdraw) && (
            <div className="actions">
              {can.logo && (
                <button type="button" className="btn btn--small" disabled={busy} onClick={() => onAsk({ kind: "logo" })}>
                  Remover logo
                </button>
              )}
              {can.withdraw && (
                <button type="button" className="btn btn--small" disabled={busy} onClick={() => onAsk({ kind: "withdraw" })}>
                  Retirar ONG da Vila
                </button>
              )}
            </div>
          )}
          {photosFailed && (
            <>
              <h4>Fotos da galeria pública</h4>
              <p className="form__error" data-state="photos-failed">
                {PHOTOS_FAILED}
              </p>
              <div className="actions">
                <button type="button" className="btn btn--small" disabled={busy} onClick={onRetry}>
                  Tentar ler as fotos de novo
                </button>
              </div>
            </>
          )}
          {can.photos.length > 0 && (
            <>
              <h4>Fotos da galeria pública</h4>
              <ul className="file-list">
                {can.photos.map((p, i) => (
                  <li key={p.id} className="file">
                    <BlobImage className="logo" source={p.url} load={fetchLogo} alt={p.caption || `Foto ${i + 1}`} />
                    <span className="file__name">
                      <strong>Foto {i + 1}</strong>
                      {p.caption && <small>{p.caption}</small>}
                    </span>
                    <button type="button" className="btn btn--small" disabled={busy} aria-label={`Remover foto ${i + 1}`} onClick={() => onAsk({ kind: "photo", photoId: p.id })}>
                      Remover foto
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <p>
        <a className="btn btn--small" href={dashApplicationUrl(ngoId)} target="_blank" rel="noopener">
          Abrir no painel
        </a>
      </p>
      <p className={state.notice?.tone === "error" ? "form__error" : "note"} role="status" aria-live="polite" data-result={state.notice?.tone ?? ""}>
        {state.notice?.text ?? ""}
      </p>
    </section>
  );
}
