/**
 * Game menu (PROPOSTA, IMPL-0022): Escape with nothing else open, or the "Menu" button of the HUD. A small
 * dialog over the village, which stays visible and keeps running behind it: the menu is not a `Panel` of the
 * store, so the frame loop, the presence connection and the environment never see it. Entries exist only where
 * there is real content: the per-device options are the ones of the "Ambiente" panel (`EnvironmentSettings`),
 * the controls come from the tables the handlers read (`lib/controls.ts`), and leaving goes through the guarded
 * confirmation (`Confirm`). Copy is pt-BR.
 */
import { Fragment, useState } from "react";

import { type MenuView, useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { controls } from "../lib/controls";
import { SERVICES } from "../lib/services";
import { Confirm } from "./Confirm";
import { EnvironmentSettings } from "./Environment";
import { PATHS } from "./Hud";
import { SavedWhere } from "./Missions";
import { Panel } from "./Panel";

/** The entries of the menu, in order. "Continuar" closes it; "Sair da Vila" asks first. */
export const MENU_ENTRIES: ReadonlyArray<{ view: MenuView; label: string }> = [
  { view: "settings", label: "Configurações" },
  { view: "controls", label: "Controles" },
  { view: "help", label: "Ajuda" },
  { view: "leave", label: "Sair da Vila" },
];

const TITLE: Record<MenuView, string> = { root: "Menu", settings: "Configurações", controls: "Controles", help: "Ajuda", leave: "Sair da Vila" };

/** Leaves the game for the public website. The game keeps nothing open: progress is already saved. */
export const leaveVillage = () => window.location.assign(SERVICES.site);

export function GameMenu() {
  const view = useVila((s) => s.menu);
  const showMenu = useVila((s) => s.showMenu);
  const closeMenu = useVila((s) => s.closeMenu);
  const accounts = useAccount((s) => s.enabled);
  const signedIn = useAccount((s) => s.user !== null);
  /** When the question of "Sair da Vila" appeared: its confirmation cannot be answered by the same gesture. */
  const [askedAt, setAskedAt] = useState(0);
  if (view === null) return null;
  return (
    <GameMenuView
      view={view}
      accounts={accounts}
      signedIn={signedIn}
      askedAt={askedAt}
      onShow={(next) => {
        if (next === "leave") setAskedAt(Date.now());
        showMenu(next);
      }}
      onClose={closeMenu}
      onLeave={leaveVillage}
    />
  );
}

export function GameMenuView({
  view,
  accounts,
  signedIn,
  askedAt,
  onShow,
  onClose,
  onLeave,
}: {
  view: MenuView;
  /** Accounts are on (`/config`): the help says where the account is. */
  accounts: boolean;
  signedIn: boolean;
  askedAt: number;
  onShow: (view: MenuView) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const back = (
    <div className="actions">
      <button type="button" className="btn" onClick={() => onShow("root")}>
        Voltar ao menu
      </button>
    </div>
  );
  return (
    <Panel kicker={view === "root" ? "Vila Noel do Bem" : "Menu"} title={TITLE[view]} variant="menu" contentKey={view} onClose={onClose}>
      {view === "root" && (
        <div className="menu" data-menu="entries">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Continuar
          </button>
          {MENU_ENTRIES.map((entry) => (
            <button key={entry.view} type="button" className="btn" onClick={() => onShow(entry.view)}>
              {entry.label}
            </button>
          ))}
          <p className="note">A Vila continua acontecendo enquanto este menu está aberto.</p>
        </div>
      )}

      {view === "settings" && (
        <>
          <EnvironmentSettings />
          {back}
        </>
      )}

      {view === "controls" && (
        <>
          {controls().map((group) => (
            <section key={group.device} className="controls" data-device={group.device}>
              <h3>{group.label}</h3>
              <dl className="facts">
                {group.rows.map((row) => (
                  <Fragment key={row.input.join()}>
                    <dt>
                      {group.device === "keyboard"
                        ? row.input.map((cap, i) => (
                            <span key={cap}>
                              {i > 0 && " ou "}
                              <kbd>{cap}</kbd>
                            </span>
                          ))
                        : row.input[0]}
                    </dt>
                    <dd>{row.does}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
          <p className="note">
            Não há botões de zoom na tela: no celular, aproxime e afaste com a pinça de dois dedos; no teclado, com as teclas + e -. Sem mouse, “Explorar
            ONGs” → “Ir até lá” leva o avatar até uma casa. Com o foco em um botão, Enter aciona esse botão; a tecla E abre o que está perto.
          </p>
          {back}
        </>
      )}

      {view === "help" && (
        <>
          <p className="lead">Um lugar para viver o Natal, compartilhar alegria e encontrar oportunidades de fazer o bem.</p>
          <ul className="bullets">
            <li>
              <strong>Andar:</strong> clique ou toque no chão. A Vila é uma praça com uma grande árvore, com terrenos de ONGs e lojas em volta e ruas de casas ao redor.
            </li>
            <li>
              <strong>ONGs:</strong> “{PATHS[0].icon} {PATHS[0].label}”, no alto da tela, lista as casas e leva você até elas. Chegue perto de uma casa (ou toque
              nela) para conhecer a organização.
            </li>
            <li>
              <strong>Jogar:</strong> “{PATHS[1].icon} {PATHS[1].label}”, no alto da tela, abre o Jogo da Memória. Jogar é gratuito e nunca é uma doação.
            </li>
            <li>
              <strong>Doação global:</strong> “{PATHS[2].icon} {PATHS[2].label}”, no alto da tela, ou a grande árvore da praça explicam como ela funciona.
            </li>
            <li>
              <strong>Missões:</strong> “★ Missões”, embaixo, abre o Caderno de Missões.
            </li>
            {accounts && (
              <li>
                <strong>Conta:</strong> o botão 👤, no alto da tela. Explorar e jogar não precisa de conta.
              </li>
            )}
          </ul>
          <p>
            <a className="btn" href={SERVICES.site} target="_blank" rel="noopener">
              Conhecer o projeto no site
            </a>
          </p>
          <p className="disclaimer">Versão de desenvolvimento · conteúdo e visual em definição.</p>
          {back}
        </>
      )}

      {view === "leave" && (
        <Confirm title="Sair da Vila e ir para o site?" confirmLabel="Sair da Vila" shownAt={askedAt} onConfirm={onLeave} onCancel={() => onShow("root")}>
          <p>Você vai para o site da Vila Noel do Bem e pode voltar quando quiser.</p>
          <SavedWhere />
          {signedIn && <p className="note">Sair da Vila não encerra a sessão da sua conta neste navegador.</p>}
        </Confirm>
      )}
    </Panel>
  );
}
