/**
 * The game menu (IMPL-0022), server-side, no browser: a modal dialog that is not full screen, the entries in
 * order and only the real ones, each view's content from its single source (the settings of the "Ambiente"
 * panel, the controls of the key map and the gesture table), and "Sair da Vila" behind the guarded
 * confirmation. `GameMenuView` has no hooks, so its handlers are reached through the element it returns.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MenuView } from "../game/store";
import { CONFIRM_ARM_MS, confirmAllowed } from "../lib/confirm";
import { controls } from "../lib/controls";
import { KEY_BINDINGS } from "../lib/hud-keys";
import { SERVICES } from "../lib/services";
import { ZOOM_GESTURES } from "../lib/zoom-gestures";
import { Confirm } from "./Confirm";
import { EnvironmentPanel, EnvironmentSettings } from "./Environment";
import { GameMenu, GameMenuView, MENU_ENTRIES } from "./Menu";

const html = (element: ReactElement) => renderToStaticMarkup(element);
/** Visible text of every button, in order. */
const buttons = (page: string) => [...page.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
const legends = (page: string) => [...page.matchAll(/<legend>(.*?)<\/legend>/g)].map((m) => m[1]);

type Props = Parameters<typeof GameMenuView>[0];
function menu(view: MenuView, over: Partial<Props> = {}) {
  const calls: string[] = [];
  const props: Props = {
    view,
    accounts: false,
    signedIn: false,
    askedAt: 1_000,
    onShow: (next) => void calls.push(`show:${next}`),
    onClose: () => void calls.push("close"),
    onLeave: () => void calls.push("leave"),
    ...over,
  };
  return { calls, props, page: html(<GameMenuView {...props} />), tree: GameMenuView(props) };
}

/** Every element of a tree of elements, in order (components are not rendered: their props are read). */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const text = (node: ReactNode): string =>
  Array.isArray(node) ? node.map(text).join("") : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : typeof node === "string" ? node : "";
/** Presses the button with this label, as a click would. */
function press(tree: ReactNode, label: string) {
  const button = elements(tree).find((e) => e.type === "button" && text(e).trim() === label);
  if (!button) throw new Error(`no button "${label}"`);
  (button.props.onClick as () => void)();
}

afterEach(() => {
  vi.doUnmock("../game/store");
  vi.unstubAllGlobals();
});

describe("the dialog", () => {
  it("is a modal dialog named 'Menu', smaller than the screen, over a light veil", () => {
    const { page } = menu("root");
    expect(page).toMatch(/^<div class="backdrop backdrop--menu">/);
    expect(page).toMatch(/<div class="panel panel--menu" role="dialog" aria-modal="true" aria-label="Menu" tabindex="-1">/);
    expect(page).toContain("<h2>Menu</h2>");
  });

  it("is closed at arrival and opens from the store", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
    const store = await import("../game/store");
    expect(html(<GameMenu />)).toBe("");
    const live = Object.assign((select: (s: unknown) => unknown) => select(store.useVila.getState()), store.useVila);
    vi.doMock("../game/store", () => ({ ...store, useVila: live }));
    const { GameMenu: Menu } = await import("./Menu");
    expect(html(<Menu />)).toBe("");
    store.useVila.getState().openMenu();
    expect(html(<Menu />)).toContain('aria-label="Menu"');
    store.useVila.getState().showMenu("controls");
    expect(html(<Menu />)).toContain('aria-label="Controles"');
  });
});

describe("entries", () => {
  it("are, in order: Continuar, Configurações, Controles, Ajuda, Sair da Vila", () => {
    expect(buttons(menu("root").page)).toEqual(["×", "Continuar", "Configurações", "Controles", "Ajuda", "Sair da Vila"]);
    expect(MENU_ENTRIES.map((e) => e.view)).toEqual(["settings", "controls", "help", "leave"]);
  });

  it("have no placeholder and no audio section: sound is one option of the real settings", () => {
    const pages = (["root", "settings", "controls", "help", "leave"] as const).map((view) => menu(view).page);
    for (const page of pages) expect(page).not.toMatch(/em breve|Em breve|em construção|Áudio|Volume|disabled/);
    expect(pages[1]).toContain("Som (vento, sininhos, passos e efeitos)");
  });

  it("'Continuar' and the close button close the menu; each entry opens its view", () => {
    const root = menu("root");
    press(root.tree, "Continuar");
    for (const label of ["Configurações", "Controles", "Ajuda"]) press(root.tree, label);
    expect(root.calls).toEqual(["close", "show:settings", "show:controls", "show:help"]);
    const closed = menu("root");
    (closed.tree.props as { onClose: () => void }).onClose(); // the × and the backdrop of `Panel`
    expect(closed.calls).toEqual(["close"]);
  });

  it("says the village keeps going behind the menu", () => {
    expect(menu("root").page).toContain("A Vila continua acontecendo enquanto este menu está aberto.");
  });

  it("every view but the question of leaving has a way back to the list", () => {
    for (const view of ["settings", "controls", "help"] as const) {
      const sub = menu(view);
      expect(buttons(sub.page)).toContain("Voltar ao menu");
      press(sub.tree, "Voltar ao menu");
      expect(sub.calls).toEqual(["show:root"]);
    }
  });
});

describe("Configurações", () => {
  it("is the one set of options of the 'Ambiente' panel, not a copy", () => {
    const settings = menu("settings");
    expect(elements(settings.tree).filter((e) => e.type === EnvironmentSettings)).toHaveLength(1);
    const options = html(<EnvironmentSettings />);
    expect(legends(options)).toEqual(["Qualidade gráfica", "Conforto", "Outros visitantes"]);
    expect(settings.page).toContain(options);
    expect(html(<EnvironmentPanel />)).toContain(options);
  });
});

describe("Controles", () => {
  it("shows every key of the key map and every wired gesture", () => {
    const { page } = menu("controls");
    for (const binding of KEY_BINDINGS) {
      for (const cap of binding.caps) expect(page).toContain(`<kbd>${cap}</kbd>`);
      expect(page).toContain(`<dd>${binding.does}</dd>`);
    }
    for (const gesture of ZOOM_GESTURES) expect(page).toContain(`<dt>${gesture.input}</dt><dd>${gesture.does}</dd>`);
    expect([...page.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1])).toEqual(controls().map((g) => g.label));
    expect([...page.matchAll(/<dt>/g)]).toHaveLength(controls().reduce((n, g) => n + g.rows.length, 0));
  });

  it("says how to zoom without buttons: pinch on a phone, keys on a keyboard", () => {
    const { page } = menu("controls");
    expect(page).toContain("Não há botões de zoom na tela: no celular, aproxime e afaste com a pinça de dois dedos; no teclado, com as teclas + e -.");
  });

  it("says whose Enter is with the focus on a button: the button's; E is always what is near", () => {
    expect(menu("controls").page).toContain("Com o foco em um botão, Enter aciona esse botão; a tecla E abre o que está perto.");
  });
});

describe("Ajuda", () => {
  it("says what the village is, where the NGOs and the missions are, and links to the public site", () => {
    const { page } = menu("help");
    expect(page).toContain("Um lugar para viver o Natal, compartilhar alegria e encontrar oportunidades de fazer o bem.");
    for (const words of ["🏡 Explorar ONGs", "🎲 Jogar", "🎄 Doação global", "★ Missões", "Caderno de Missões"]) expect(page).toContain(words);
    expect(page).toContain(`<a class="btn btn--small" href="${SERVICES.site}" target="_blank" rel="noopener">Conhecer o projeto no site</a>`);
    expect(page).toContain("Jogar é gratuito e nunca é uma doação.");
  });

  it("mentions the account only when accounts exist", () => {
    expect(menu("help").page).not.toMatch(/Conta:|👤/);
    expect(menu("help", { accounts: true }).page).toContain("<strong>Conta:</strong> o botão 👤, no alto da tela. Explorar e jogar não precisa de conta.");
  });
});

describe("Sair da Vila", () => {
  it("asks first: the entry opens the question and leaves nothing", () => {
    const root = menu("root");
    press(root.tree, "Sair da Vila");
    expect(root.calls).toEqual(["show:leave"]);
  });

  it("is answered through the guarded confirmation, with 'Cancelar' first", () => {
    const leave = menu("leave");
    expect(leave.page).toContain("data-confirm");
    expect(leave.page).toContain("<strong>Sair da Vila e ir para o site?</strong>");
    expect(buttons(leave.page)).toEqual(["×", "Cancelar", "Sair da Vila"]);
    expect(leave.page).toContain("Seu progresso fica salvo neste navegador.");
    expect(leave.calls).toEqual([]); // showing the question leaves nothing

    const [confirm] = elements(leave.tree).filter((e) => e.type === Confirm);
    expect(confirm.props).toMatchObject({ confirmLabel: "Sair da Vila", shownAt: 1_000 });
    (confirm.props.onCancel as () => void)();
    expect(leave.calls).toEqual(["show:root"]);
    (confirm.props.onConfirm as () => void)();
    expect(leave.calls).toEqual(["show:root", "leave"]);
    // The press that opened the question cannot answer it (`Confirm` checks this on its button).
    expect(confirmAllowed({ detail: 1 }, 1_000, 1_000 + CONFIRM_ARM_MS - 1)).toBe(false);
    expect(confirmAllowed({ detail: 2 }, 1_000, 1_000 + CONFIRM_ARM_MS)).toBe(false);
    expect(confirmAllowed({ detail: 1 }, 1_000, 1_000 + CONFIRM_ARM_MS)).toBe(true);
  });

  it("goes to the public site and says the session stays, for a signed-in account", () => {
    expect(SERVICES.site).toMatch(/^https?:\/\//);
    expect(menu("leave").page).not.toContain("sessão");
    expect(menu("leave", { signedIn: true }).page).toContain("Sair da Vila não encerra a sessão da sua conta neste navegador.");
  });
});
