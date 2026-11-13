/**
 * What a visitor reads on the panels of the expanded village (IMPL-0023, PROPOSTA; server-side render, no
 * browser): every panel says what is there and that it is not open, and none offers anything to buy, to claim
 * or to rent. They are ordinary panels (veil, Escape, the walk held). The action that opens them is the HUD's
 * one contextual action (`Hud.test.tsx`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { billboardNotice, BILLBOARDS, PLOT_TIERS, RESIDENTIAL_PLOTS, SHOP_COPY, SHOPS, VILLAGE_NOTICES, VILLAGE_PLAN } from "@vila/shared/game/world";

import { sim, walkRoute } from "../game/sim";
import { useVila } from "../game/store";
import { pressEscape } from "../lib/escape";
import { Lot } from "./Lot";
import { BillboardPanel, PlotPanel, ShopPanel } from "./Village";

/** Words that would turn a placeholder into a sale: none may appear on these panels. */
const MONEY = /R\$|\bcomprar?\b|\bcompre\b|\bpreço\b|\bmoedas?\b|\bpagar\b|\bpagamento\b|\balugue\b|\bcarrinho\b/i;
/** Every button of a rendered panel except the one that closes it. */
const buttons = (html: string) => (html.match(/<button[^>]*>/g) ?? []).filter((b) => !b.includes('aria-label="Fechar"'));

afterEach(() => useVila.setState({ panel: { kind: "none" }, menu: null, nearby: null }));

describe("residential plot panel", () => {
  it.each(PLOT_TIERS)("says the id, the tier, what the tier requires and that ownership is not open (%s)", (tier) => {
    const plot = RESIDENTIAL_PLOTS.find((p) => p.tier === tier)!;
    const html = renderToStaticMarkup(<PlotPanel plotId={plot.id} />);
    expect(html).toContain("A posse de terrenos ainda não está aberta.");
    expect(html).toContain(`<code>${plot.id}</code>`);
    expect(html).toContain(VILLAGE_PLAN.tiers[tier].label);
    expect(html).toContain(`Chegar ao nível ${VILLAGE_PLAN.tiers[tier].requirement.level} jogando`);
    expect(html).toContain("proposta em estudo");
    expect(html).toContain("A casa neste terreno é cenário");
    expect(MONEY.test(html)).toBe(false);
    expect(buttons(html)).toEqual([]);
    expect(html).toContain('role="dialog"');
  });

  it("draws nothing for an id that is not a plot", () => {
    expect(renderToStaticMarkup(<PlotPanel plotId="plaza-01" />)).toBe("");
  });
});

describe("shop panel", () => {
  it.each(SHOPS.map((s) => s.id))("says what %s will offer and that it has not opened", (id) => {
    const html = renderToStaticMarkup(<ShopPanel shopId={id} />);
    const copy = SHOP_COPY[SHOPS.findIndex((s) => s.id === id)];
    expect(html).toContain(copy.name);
    expect(html).toContain(copy.offer);
    expect(html).toContain("Esta loja ainda não abriu.");
    expect(html).toContain("Nada será vendido por dinheiro");
    expect(html).toContain(`<code>${id}</code>`);
    expect(MONEY.test(html.replace("Nada será vendido por dinheiro", ""))).toBe(false);
    expect(buttons(html)).toEqual([]);
  });

  it("gives every shop its own name and offer, none of them a brand", () => {
    expect(new Set(SHOPS.map((s) => SHOP_COPY[SHOPS.indexOf(s)].name)).size).toBe(SHOPS.length);
    expect(renderToStaticMarkup(<ShopPanel shopId="shop-99" />)).toBe("");
  });
});

describe("billboard panel", () => {
  it.each(BILLBOARDS.map((b) => b.id))("shows the notice of %s as text, its id, and that the space is not for rent", (id) => {
    const html = renderToStaticMarkup(<BillboardPanel billboardId={id} />);
    expect(html).toContain(billboardNotice(id));
    expect(html).toContain(`<code>${id}</code>`);
    expect(html).toContain("ainda não está disponível para aluguel");
    expect(html).toContain("avisos da própria Vila");
    expect(buttons(html)).toEqual([]);
  });

  it("shows only notices of the village: short, no link, no brand, one per billboard", () => {
    expect(new Set(BILLBOARDS.map((b) => billboardNotice(b.id))).size).toBe(BILLBOARDS.length);
    for (const text of VILLAGE_NOTICES) {
      expect(text.length).toBeLessThanOrEqual(60);
      expect(/https?:|www\.|@|R\$|%/.test(text)).toBe(false);
    }
  });
});

describe("the three panels behave like every other panel", () => {
  const PANELS = [
    { state: { kind: "plot", plotId: "economy-07" }, element: <PlotPanel plotId="economy-07" /> },
    { state: { kind: "shop", shopId: "shop-02" }, element: <ShopPanel shopId="shop-02" /> },
    { state: { kind: "billboard", billboardId: "billboard-02" }, element: <BillboardPanel billboardId="billboard-02" /> },
  ] as const;

  it.each(PANELS)("$state.kind: the shared dialog inside the veil, with the one close button", ({ element }) => {
    const html = renderToStaticMarkup(element);
    // `ui/Panel.tsx`: the veil that closes on a press outside, around a modal dialog that takes the focus.
    expect(html).toMatch(/^<div class="backdrop"><div class="panel" role="dialog" aria-modal="true" aria-label="[^"]+" tabindex="-1">/);
    expect(html.match(/<button[^>]*aria-label="Fechar"/g)).toHaveLength(1);
  });

  it.each(PANELS)("$state.kind: Escape closes it and that press does not open the menu; the menu does not open over it", ({ state }) => {
    useVila.getState().open(state);
    useVila.getState().openMenu();
    expect(useVila.getState().menu).toBeNull();
    expect(pressEscape({ target: null })).toBe("close-panel");
    expect(useVila.getState().panel).toEqual({ kind: "none" });
    expect(useVila.getState().menu).toBeNull();
  });

  it.each(PANELS)("$state.kind: holds the walk while it is open, like every panel", ({ state }) => {
    expect(walkRoute({ panel: { kind: "none" } })).toBe(sim.route);
    expect(walkRoute({ panel: state })).toBeNull();
  });
});

describe("lot the API does not list yet", () => {
  it("offers no application on a lot older databases do not have (before migration 0011)", () => {
    const html = renderToStaticMarkup(<Lot lotId="plaza-12" unlisted />);
    expect(html).toContain("Este terreno ainda não recebe candidaturas.");
    expect(html).not.toContain("Candidatar minha ONG");
    expect(html).not.toContain("Conheça o cadastro");
  });
});
