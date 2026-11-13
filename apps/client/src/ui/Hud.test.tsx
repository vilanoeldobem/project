/**
 * What the HUD draws at arrival and around the game menu (IMPL-0022), server-side, no browser: no dialog in
 * front of the village, the three paths one press away with their names, one "Menu" button, no zoom buttons
 * and no brand, the line that says how to walk only until the first walk (announced once, with the keys of the
 * key map), the account chip with a long nickname or a blocked account, and tooltips only on controls that can
 * be icon-only or whose name is cut. What only a browser can measure (sizes, overlap, what a tooltip covers) is
 * in the rules of `styles.css` that the last tests read.
 */

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@vila/shared/accounts/contract";

import { KEY_BINDINGS } from "../lib/hud-keys";
import css from "../styles.css?raw";

const ADMIN: Me = { id: "a1", name: "Ana Lima", nickname: "ana_admin", city: "Recife", email: "ana@example.com", role: "admin" };

const PLAYER: Me = { id: "p1", name: "Pessoa Teste", nickname: "ana", city: "Recife", email: "p@example.com", role: "player" };
const BLOCKED = { message: "Motivo.", at: "2026-11-01T12:00:00Z" };
/** 20 characters: the longest nickname the API accepts. */
const LONG = "nome_muito_comprido1";

/** The declarations of the first rule with exactly this selector. */
const rule = (selector: string, sheet = css) => new RegExp(`(?:^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(sheet)?.[1] ?? "";

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
  const { Hud, PATHS, activate } = await import("./Hud");
  return { Hud, PATHS, activate, useVila: store.useVila, useAccount: account.useAccount, useModeration: moderation.useModeration, hud: () => html(<Hud />) };
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
  const WALK = "Clique ou toque no chão para andar.";
  const menuKey = KEY_BINDINGS.find((b) => b.action === "menu")!.caps[0];
  /** The text inside the live region that announces the line. */
  const announced = (page: string) => /<p class="sr-only" role="status" data-hint="announce">(.*?)<\/p>/.exec(page)?.[1];

  it("is one line of text with no control in it, shown on a first visit once the scene is on screen", async () => {
    const { hud, useVila } = await load();
    expect(hud()).not.toContain("hud__hint"); // still loading: there is no ground to click yet
    useVila.setState({ sceneReady: true });
    const line = /<p class="hud__hint"[^>]*>.*?<\/p>/.exec(hud())?.[0] ?? "";
    expect(line).toContain(`data-hint="move">${WALK}`);
    expect(line).not.toMatch(/<button|<a |tabindex/);
  });

  it("also says what helps without a mouse, with the key of the key map", async () => {
    const { hud, useVila, PATHS } = await load();
    useVila.setState({ sceneReady: true });
    expect(menuKey).toBe("Esc");
    expect(hud()).toContain(`<span class="hint__keys"> Sem mouse: “${PATHS[0].label}” leva até uma casa e <kbd>${menuKey}</kbd> abre o menu.</span>`);
  });

  it("is announced once: the live region is on the page before its text and keeps it while panels come and go", async () => {
    const { hud, useVila, PATHS } = await load();
    expect(announced(hud())).toBe(""); // mounted empty, while the village loads
    useVila.setState({ sceneReady: true });
    const text = `${WALK} Sem mouse: “${PATHS[0].label}” leva até uma casa e a tecla ${menuKey} abre o menu.`;
    expect(announced(hud())).toBe(text);
    // The visible line is the same sentence: it is not read a second time.
    expect(hud()).toContain('<p class="hud__hint" aria-hidden="true" data-hint="move">');
    // What hides the visible line does not empty the region (text put back would be announced again).
    useVila.setState({ nearby: { kind: "tree" } });
    expect(announced(hud())).toBe(text);
    useVila.getState().open({ kind: "explore" });
    expect(announced(hud())).toBe(text);
    useVila.getState().close();
    useVila.getState().setTarget({ x: -8, z: 0 });
    expect(announced(hud())).toBe("");
  });

  it("announces nothing to a visitor who has walked before", async () => {
    const back = await load({ moved: true });
    back.useVila.setState({ sceneReady: true });
    expect(announced(back.hud())).toBe("");
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

  it("gives way to the moderation block: on a short screen there is no room for both", async () => {
    const { hud, useVila, useAccount, useModeration } = await load();
    useVila.setState({ sceneReady: true });
    useAccount.setState({ enabled: true, user: ADMIN });
    expect(hud()).toContain("hud__hint");
    useModeration.setState({ on: true });
    expect(hud()).toContain("Modo moderação ligado");
    expect(hud()).not.toContain("hud__hint");
    useModeration.setState({ on: false });
    expect(hud()).toContain("hud__hint");
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

describe("the one contextual action, for the places of the expanded village too (IMPL-0024)", () => {
  const PLACES = [
    { near: { kind: "plot", plotId: "economy-07" }, label: "🏠 Ver terreno residencial", panel: { kind: "plot", plotId: "economy-07" } },
    { near: { kind: "shop", shopId: "shop-02" }, label: "🎁 Ver loja", panel: { kind: "shop", shopId: "shop-02" } },
    { near: { kind: "billboard", billboardId: "billboard-02" }, label: "📜 Ler placa", panel: { kind: "billboard", billboardId: "billboard-02" } },
  ] as const;
  /** Every contextual action button on the page. */
  const actions = (page: string) => buttons(page).filter((b) => b.attributes.includes("hud__action"));

  it.each(PLACES)("$near.kind: is the HUD's own action button, one of it, inside the HUD and with the E key cap", async ({ near, label }) => {
    const { hud, useVila } = await load();
    useVila.setState({ nearby: near });
    const page = hud();
    expect(actions(page)).toHaveLength(1);
    expect(page).toContain(`<button class="btn btn--primary hud__action">${label} <kbd>E</kbd></button>`);
    // One HUD layer: the temporary button drew a second one beside it.
    expect(page.match(/class="hud"/g)).toHaveLength(1);
    expect(page.indexOf("hud__action")).toBeGreaterThan(page.indexOf('class="hud__bottom"'));
  });

  it.each(PLACES)("$near.kind: follows the rules of every action: hidden under a panel and under the menu, and the hint gives way", async ({ near }) => {
    const { hud, useVila } = await load();
    useVila.setState({ sceneReady: true });
    expect(hud()).toContain("hud__hint");
    useVila.setState({ nearby: near });
    expect(hud()).not.toContain("hud__hint");
    expect(actions(hud())).toHaveLength(1);
    useVila.getState().open({ kind: "missions" });
    expect(actions(hud())).toHaveLength(0);
    useVila.getState().close();
    useVila.getState().openMenu();
    expect(actions(hud())).toHaveLength(0);
    useVila.getState().closeMenu();
    expect(actions(hud())).toHaveLength(1);
  });

  it.each(PLACES)("$near.kind: opens its panel, which closes the menu like every panel", async ({ near, panel }) => {
    const { activate, useVila } = await load();
    activate(near);
    expect(useVila.getState().panel).toEqual(panel);
    expect(useVila.getState().menu).toBeNull();
  });

  it("opens what it always opened for the tree, the lectern, a lot and a villager", async () => {
    const { activate, useVila } = await load();
    const opened = (near: Parameters<typeof activate>[0]) => (activate(near), useVila.getState().panel);
    expect(opened({ kind: "tree" })).toEqual({ kind: "donation" });
    expect(opened({ kind: "donation-panel" })).toEqual({ kind: "donation" });
    expect(opened({ kind: "lot", lotId: "plaza-12" })).toEqual({ kind: "lot", lotId: "plaza-12" });
    expect(opened({ kind: "npc", npcId: "storyteller" })).toEqual({ kind: "npc", npcId: "storyteller" });
  });

  it("is the only action button and the only reader of the key map: the temporary component is gone", async () => {
    const sources = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const files = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path));
    expect(files.length).toBeGreaterThan(40);
    expect(files.filter(([, text]) => text.includes("hud__action")).map(([path]) => path)).toEqual(["./Hud.tsx"]);
    // The keys of the game are read in one place (`hudKeyAction`, `boundAction`): no second listener answers E or Enter.
    expect(files.filter(([, text]) => /\b(hudKeyAction|boundAction)\(/.test(text)).map(([path]) => path).sort()).toEqual(["../lib/hud-keys.ts", "./Hud.tsx"]);
    expect(files.some(([path]) => path.includes("VillageAction"))).toBe(false);
  });
});

describe("account chip", () => {
  /** The account chip: its attributes and its label, span by span. */
  const chip = (page: string) => {
    const [, attributes, inner] = /<button([^>]*aria-label="Sua conta[^>]*)>(.*?)<\/button>/.exec(page) ?? [];
    return { attributes, label: /<span class="chip__label">(.*)<\/span>$/.exec(inner ?? "")?.[1] };
  };

  it("shows a short nickname whole, with no mark of a cut name", async () => {
    const { hud, useAccount } = await load();
    useAccount.setState({ enabled: true, user: PLAYER });
    expect(chip(hud()).label).toBe('<span class="chip__name">@ana</span>');
    expect(chip(hud()).attributes).not.toContain("chip--cut");
  });

  it("keeps '(bloqueada)' in a span of its own, whole, whatever the nickname", async () => {
    const { hud, useAccount } = await load();
    for (const nickname of ["ana", "joao_pedro", LONG]) {
      useAccount.setState({ enabled: true, user: { ...PLAYER, nickname, blocked: BLOCKED } });
      expect(chip(hud()).label).toMatch(/^<span class="chip__name">@[^<]+<\/span><span class="chip__state"> \(bloqueada\)<\/span>$/);
      expect(chip(hud()).attributes).toContain(`aria-label="Sua conta: ${nickname} (bloqueada)"`);
    }
    // No rule cuts the label any more: the only cut is the one the component makes in the nickname.
    expect(css).not.toMatch(/\.chip__label[^{]*\{[^}]*(max-width|text-overflow)/);
    expect(rule(".chip__state")).toContain("flex: none");
  });

  it("cuts only the nickname when it is long, and then offers the full text as a tooltip", async () => {
    const { hud, useAccount } = await load();
    useAccount.setState({ enabled: true, user: { ...PLAYER, nickname: LONG, blocked: BLOCKED } });
    const long = chip(hud());
    expect(long.label).toBe('<span class="chip__name">@nome_muito_…</span><span class="chip__state"> (bloqueada)</span>');
    expect(long.attributes).toContain('class="btn btn--chip chip--cut"');
    expect(long.attributes).toContain(`data-tip="Sua conta: ${LONG} (bloqueada)"`);
    // The tooltip of a cut name shows at every width, on hover and on keyboard focus.
    expect(css).toContain(".chip--cut[data-tip]:focus-visible::after { display: block; }");
    expect(css).toContain("@media (hover: hover) { .chip--cut[data-tip]:hover::after { display: block; } }");
    useAccount.setState({ enabled: true, user: { ...PLAYER, nickname: "doze_letras1" } }); // 12: the longest shown whole
    expect(chip(hud()).label).toBe('<span class="chip__name">@doze_letras1</span>');
    expect(chip(hud()).attributes).not.toContain("chip--cut");
  });
});

describe("tooltips", () => {
  it("exist only on controls that can be icon-only or have a cut name, and say the control's name", async () => {
    const { hud, useAccount } = await load();
    useAccount.setState({ enabled: true, user: ADMIN });
    const page = hud();
    expect(page).not.toMatch(/<button[^>]* title=/);
    const tipped = buttons(page).filter((b) => b.attributes.includes("data-tip="));
    // The sky view (always an icon), then the controls whose label gives way on narrow screens.
    expect(tipped.map((b) => /data-tip="([^"]*)"/.exec(b.attributes)![1])).toEqual(["Olhar o céu", "Indicadores", "Sua conta: ana_admin", "Ligar o modo moderação", "Menu"]);
    for (const b of tipped) expect(b.attributes).toMatch(/aria-label="/);
  });

  it("stay inside the screen: placed against their group, never wider than the HUD, and a long one wraps", () => {
    // Against the chip, the tooltip of the account ran off the left edge at 320 px with a long nickname.
    expect(rule(".hud__group")).toContain("position: relative");
    expect(css).not.toMatch(/\.btn--chip\[data-tip\] \{[^}]*position: relative/);
    const tip = rule(".btn--chip[data-tip]::after");
    expect(tip).toContain("left: 0");
    expect(tip).toContain("box-sizing: border-box; width: max-content; max-width: calc(100vw - var(--hud-left) - var(--hud-right))");
    expect(tip).toContain("white-space: normal");
    expect(rule(".hud__system .btn--chip[data-tip]::after")).toMatch(/left: auto; right: 0/);
    // A pressed chip sinks with a transform and becomes the tooltip's containing block: no tooltip during the press.
    expect(rule(".btn--chip[data-tip]:active::after")).toContain("content: none");
    // The gutters the tooltip counts on are the ones the HUD is drawn with.
    expect(rule(".hud")).toContain("padding: max(12px, env(safe-area-inset-top)) var(--hud-right) max(16px, env(safe-area-inset-bottom)) var(--hud-left)");
  });
});

describe("a short screen (a phone lying down) with the moderation block", () => {
  it("lets the middle block shrink, and its boxes scroll inside themselves instead of covering the bottom", () => {
    expect(rule(".hud__top, .hud__bottom")).toContain("flex: none");
    expect(rule(".hud__mid")).toMatch(/flex: 0 1 auto; min-height: 0/);
    expect(rule(".hud__info")).toMatch(/min-height: 0; max-height: 100%/);
    expect(rule(".modbar, .hud__notice")).toMatch(/min-height: 0;.*overflow-y: auto/);
    // No floor under the block: the old `max(120px, …)` was taller than the room a 320 px high screen leaves.
    expect(rule(".modbar")).not.toMatch(/max-height|120px/);
  });
});
