/**
 * What the HUD draws at arrival and around the game menu (IMPL-0022), server-side, no browser: no dialog in
 * front of the village, the three paths one press away with their names, one "Menu" button, no zoom buttons
 * and no brand, the line that says how to walk only until the first walk, and tooltips only on controls that
 * can be icon-only.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@vila/shared/accounts/contract";

const ADMIN: Me = { id: "a1", name: "Ana Lima", nickname: "ana_admin", city: "Recife", email: "ana@example.com", role: "admin" };

const html = (element: ReactElement) => renderToStaticMarkup(element);
/** Every `<button …>…</button>`: its attributes and its visible text. */
const buttons = (page: string) => [...page.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((m) => ({ attributes: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }));
/** The part of the page inside the navigation landmark. */
const nav = (page: string) => /<nav [^>]*aria-label="Vila"[^>]*>(.*?)<\/nav>/.exec(page)?.[1] ?? "";
/** As in `Moderation.test.tsx`: the hook reads the current state of the store instead of the server snapshot. */
const live = <S,>(store: { getState: () => S }) => Object.assign((select?: (s: S) => unknown) => (select ? select(store.getState()) : store.getState()), store);

/** A fresh page load. `moved`: this browser has walked before. */
async function load({ moved = false } = {}) {
  const storage = new Map<string, string>(moved ? [["vila.moved.v1", "1"]] : []);
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
  vi.stubGlobal("window", new EventTarget());
  vi.resetModules();
  const store = await import("../game/store");
  const account = await import("../lib/account");
  const moderation = await import("../lib/moderation");
  vi.doMock("../game/store", () => ({ ...store, useVila: live(store.useVila) }));
  vi.doMock("../lib/account", () => ({ ...account, useAccount: live(account.useAccount) }));
  vi.doMock("../lib/moderation", () => ({ ...moderation, useModeration: live(moderation.useModeration) }));
  const { Hud, PATHS } = await import("./Hud");
  return { Hud, PATHS, useVila: store.useVila, useAccount: account.useAccount, useModeration: moderation.useModeration, hud: () => html(<Hud />) };
}

afterEach(() => {
  vi.doUnmock("../game/store");
  vi.doUnmock("../lib/account");
  vi.doUnmock("../lib/moderation");
  vi.unstubAllGlobals();
});

describe("arrival", () => {
  it("puts no dialog in front of the village and asks for no click to enter", async () => {
    const { hud } = await load();
    const page = hud();
    expect(page).not.toMatch(/role="dialog"|aria-modal|class="backdrop/);
    expect(page).not.toMatch(/Entrar na Vila|Boas-vindas|welcome/);
  });

  it("keeps the three paths one press away, with their names, inside the navigation", async () => {
    const { hud, PATHS, useVila } = await load();
    const paths = buttons(nav(hud())).filter((b) => b.attributes.includes("data-path="));
    expect(paths.map((b) => b.text)).toEqual(["🏡Explorar ONGs", "🎲Jogar", "🎄Doação global"]);
    expect(nav(hud())).toMatch(/role="group" aria-label="Caminhos da Vila"/);
    // Each opens the panel it always opened, straight from the village.
    expect(PATHS.map((p) => [p.label, p.panel.kind])).toEqual([
      ["Explorar ONGs", "explore"],
      ["Jogar", "memory"],
      ["Doação global", "donation"],
    ]);
    for (const path of PATHS) {
      useVila.getState().open(path.panel);
      expect(useVila.getState().panel).toEqual(path.panel);
      useVila.getState().close();
    }
  });

  it("names every path with visible words, not with a tooltip", async () => {
    const { hud } = await load();
    for (const b of buttons(hud()).filter((b) => b.attributes.includes("data-path="))) expect(b.attributes).not.toMatch(/data-tip|title=|aria-label/);
  });

  it("has one coherent navigation: paths, then indicators and the menu", async () => {
    const { hud } = await load();
    expect(buttons(nav(hud())).slice(-5).map((b) => b.text)).toEqual(["🏡Explorar ONGs", "🎲Jogar", "🎄Doação global", "📊Indicadores", "☰Menu"]);
  });

  it("adds the account and, for an administrator, the moderation switch to the same group", async () => {
    const { hud, useAccount } = await load();
    useAccount.setState({ enabled: true, user: null });
    expect(buttons(nav(hud())).slice(-3).map((b) => b.text)).toEqual(["📊Indicadores", "👤Entrar", "☰Menu"]);
    useAccount.setState({ enabled: true, user: ADMIN });
    expect(buttons(nav(hud())).slice(-4).map((b) => b.text)).toEqual(["📊Indicadores", "👤@ana_admin", "🛡️Moderação", "☰Menu"]);
  });
});

describe("what left the gameplay screen", () => {
  it("has no zoom buttons", async () => {
    const { hud } = await load();
    const page = hud();
    expect(page).not.toMatch(/Aproximar|Afastar|Zoom da câmera|hud__zoom|＋|－/);
    expect(buttons(page).map((b) => b.text).filter((t) => /^[+\-−]$/.test(t))).toEqual([]);
  });

  it("has no wordmark or logo, and no button back to a welcome screen", async () => {
    const { hud } = await load();
    const page = hud();
    expect(page).not.toMatch(/wordmark|VILA NOEL|DO BEM|hud__brand|aria-label="Início"|<img|<h1/);
  });
});

describe("menu button", () => {
  it("is one button with an icon, a visible label and an accessible name", async () => {
    const { hud, useVila } = await load();
    const menu = buttons(hud()).filter((b) => /aria-label="Menu"/.test(b.attributes));
    expect(menu).toHaveLength(1);
    expect(menu[0].text).toBe("☰Menu");
    expect(menu[0].attributes).toMatch(/aria-haspopup="dialog"/);
    expect(menu[0].attributes).toMatch(/aria-expanded="false"/);
    useVila.getState().openMenu();
    expect(buttons(hud()).find((b) => /aria-label="Menu"/.test(b.attributes))!.attributes).toMatch(/aria-expanded="true"/);
  });
});

describe("the line that says how to walk", () => {
  it("is one line of text with no control in it, shown on a first visit once the scene is on screen", async () => {
    const { hud, useVila } = await load();
    expect(hud()).not.toContain("hud__hint"); // still loading: there is no ground to click yet
    useVila.setState({ sceneReady: true });
    expect(hud()).toContain('<p class="hud__hint" role="status" data-hint="move">Clique ou toque no chão para andar.</p>');
  });

  it("goes away at the first walk and is not shown to a visitor who has walked before", async () => {
    const first = await load();
    first.useVila.setState({ sceneReady: true });
    expect(first.hud()).toContain("hud__hint");
    first.useVila.getState().setTarget({ x: -8, z: 0 });
    expect(first.hud()).not.toContain("hud__hint");
    const back = await load({ moved: true });
    back.useVila.setState({ sceneReady: true });
    expect(back.hud()).not.toContain("hud__hint");
  });

  it("gives way to the action button, a panel and the menu", async () => {
    const { hud, useVila } = await load();
    useVila.setState({ sceneReady: true });
    expect(hud()).toContain("hud__hint");
    useVila.setState({ nearby: { kind: "tree" } });
    expect(hud()).not.toContain("hud__hint");
    expect(hud()).toContain("hud__action");
    useVila.setState({ nearby: null });
    useVila.getState().open({ kind: "explore" });
    expect(hud()).not.toContain("hud__hint");
    useVila.getState().close();
    useVila.getState().openMenu();
    expect(hud()).not.toContain("hud__hint");
  });
});

describe("with the menu open", () => {
  it("hides the action button, as with a panel", async () => {
    const { hud, useVila } = await load();
    useVila.setState({ nearby: { kind: "tree" } });
    expect(hud()).toMatch(/hud__action[^>]*>🎄 Doação global <kbd>E<\/kbd>/);
    useVila.getState().openMenu();
    expect(hud()).not.toContain("hud__action");
  });

  it("hides the controls of the moderation block, which would sit behind it", async () => {
    const { hud, useVila, useAccount, useModeration } = await load();
    useAccount.setState({ enabled: true, user: ADMIN });
    useModeration.setState({ on: true });
    expect(hud()).toContain("Desligar modo moderação");
    useVila.getState().openMenu();
    expect(hud()).toContain("Modo moderação ligado");
    expect(hud()).not.toContain("Desligar modo moderação");
  });
});

describe("tooltips", () => {
  it("exist only on controls that can be icon-only, and say the control's name", async () => {
    const { hud, useAccount } = await load();
    useAccount.setState({ enabled: true, user: ADMIN });
    const page = hud();
    expect(page).not.toMatch(/<button[^>]* title=/);
    const tipped = buttons(page).filter((b) => b.attributes.includes("data-tip="));
    // The sky view (always an icon), then the controls whose label gives way on narrow screens.
    expect(tipped.map((b) => /data-tip="([^"]*)"/.exec(b.attributes)![1])).toEqual(["Olhar o céu", "Indicadores", "Sua conta: ana_admin", "Ligar o modo moderação", "Menu"]);
    for (const b of tipped) expect(b.attributes).toMatch(/aria-label="/);
  });
});
