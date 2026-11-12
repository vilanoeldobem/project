/**
 * Moderation mode on the HUD (IMPL-0021), flat HTML over the canvas, pt-BR: the switch an administrator turns
 * on and off, the indicator that stays on screen while it is on, and (PROPOSTA, only with the API's
 * `moderation.presence`) removing a visitor from the room. Each piece is a pure view plus a thin wrapper that
 * reads the stores; every view renders nothing unless the account may moderate, whatever else it is given.
 */
import { useRef } from "react";

import type { Me } from "@vila/shared/accounts/contract";

import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { canModerate, moderating, type RemovalNotice, useModeration } from "../lib/moderation";
import { type NetStatus, useNet } from "../net/multiplayer";
import { Confirm, useFocusReturn } from "./Confirm";

/** HUD chip, administrators only: turns moderation mode on and off. */
export function ModerationChip() {
  const user = useAccount((s) => s.user);
  const on = useModeration((s) => s.on);
  const setOn = useModeration((s) => s.setOn);
  return <ModerationChipView user={user} on={on} onToggle={() => setOn(!on)} />;
}

export function ModerationChipView({ user, on, onToggle }: { user: Me | null; on: boolean; onToggle: () => void }) {
  if (!canModerate(user)) return null;
  return (
    <button className={`btn btn--chip${on ? " is-on" : ""}`} aria-pressed={on} aria-label="Modo moderação" title={on ? "Desligar o modo moderação" : "Ligar o modo moderação"} onClick={onToggle}>
      🛡️ <span>Moderação</span>
    </button>
  );
}

/** The indicator: on top of everything, panels included, for as long as the mode is on. Text only, takes no clicks. */
export function ModerationFlag() {
  const user = useAccount((s) => s.user);
  const on = useModeration((s) => s.on);
  return <ModerationFlagView user={user} on={on} />;
}

export function ModerationFlagView({ user, on }: { user: Me | null; on: boolean }) {
  if (!moderating(user, on)) return null;
  return (
    <div className="modflag" role="status" data-moderation="flag">
      🛡️ Modo moderação
    </div>
  );
}

/** HUD block of moderation mode: what it does, how to leave it, and the visitor removal. */
export function ModerationBar() {
  const user = useAccount((s) => s.user);
  const presence = useAccount((s) => s.presenceModeration);
  const { on, selected, askedAt, sending, notice, setOn, selectNext, select, ask, cancel, confirm } = useModeration();
  const net = useNet();
  const idle = useVila((s) => s.panel.kind === "none");
  return (
    <ModerationBarView
      user={user}
      on={on}
      presence={presence}
      net={net.status}
      others={net.others}
      selected={selected}
      askedAt={askedAt}
      sending={sending}
      notice={notice}
      idle={idle}
      onOff={() => setOn(false)}
      onNext={selectNext}
      onClear={() => select(null)}
      onAsk={ask}
      onCancel={cancel}
      onConfirm={() => void confirm()}
    />
  );
}

export function ModerationBarView({
  user,
  on,
  presence,
  net,
  others,
  selected,
  askedAt,
  sending,
  notice,
  idle,
  onOff,
  onNext,
  onClear,
  onAsk,
  onCancel,
  onConfirm,
}: {
  user: Me | null;
  on: boolean;
  /** `/config.moderation.presence`: removing a visitor works (PROPOSTA). */
  presence: boolean;
  net: NetStatus;
  others: number;
  selected: number | null;
  askedAt: number | null;
  sending: boolean;
  notice: RemovalNotice | null;
  /** No panel is open: the controls are shown (with one open they would sit behind it). */
  idle: boolean;
  onOff: () => void;
  onNext: () => void;
  onClear: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bar = useRef<HTMLElement>(null);
  // Confirming, cancelling or losing the selection removes the focused button: focus stays in this block.
  useFocusReturn(bar, `${selected}|${askedAt}|${sending}`);
  if (!moderating(user, on)) return null;
  const online = net === "online";
  return (
    <section className="modbar" aria-label="Moderação" data-moderation="bar" tabIndex={-1} ref={bar}>
      <p className="modbar__title">
        <strong>Modo moderação ligado</strong>
      </p>
      {idle && (
        <>
          <p className="note">As ações de moderação aparecem no painel da casa de cada ONG publicada.</p>
          {presence && (
            <div className="modbar__visitors" role="group" aria-label="Visitantes da sala" aria-busy={sending}>
              {!online ? (
                <p className="note">Sem conexão com uma sala agora: não há visitantes para moderar.</p>
              ) : selected === null ? (
                <>
                  <p className="note">
                    {others ? "Clique em um visitante para selecionar, ou use o botão abaixo." : "Não há outros visitantes nesta sala."} Remover da sala é uma PROPOSTA
                    (IMPL-0021): o visitante pode voltar depois.
                  </p>
                  {others > 0 && (
                    <button type="button" className="btn btn--small" onClick={onNext}>
                      Selecionar visitante mais próximo
                    </button>
                  )}
                </>
              ) : askedAt !== null ? (
                <Confirm
                  title={`Remover o visitante nº ${selected} da sala?`}
                  confirmLabel={`Remover o visitante nº ${selected}`}
                  shownAt={askedAt}
                  onConfirm={onConfirm}
                  onCancel={onCancel}
                >
                  <p className="note">A pessoa lê que foi removida por um administrador e pode voltar depois de 1 minuto. A remoção fica registrada na auditoria.</p>
                </Confirm>
              ) : (
                <>
                  <p>
                    <strong>Visitante nº {selected}</strong> selecionado (marcado com um anel na Vila).
                  </p>
                  <div className="actions">
                    <button type="button" className="btn btn--small btn--primary" disabled={sending} onClick={onAsk}>
                      {sending ? "Removendo…" : "Remover da sala"}
                    </button>
                    <button type="button" className="btn btn--small" disabled={sending} onClick={onNext}>
                      Próximo visitante
                    </button>
                    <button type="button" className="btn btn--small" disabled={sending} onClick={onClear}>
                      Cancelar seleção
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button type="button" className="btn btn--small" onClick={onOff}>
            Desligar modo moderação
          </button>
        </>
      )}
      <p className={notice && !notice.ok ? "form__error" : "note"} role="status" aria-live="polite" data-result={notice ? (notice.ok ? "ok" : "failed") : ""}>
        {notice?.text ?? ""}
      </p>
    </section>
  );
}
