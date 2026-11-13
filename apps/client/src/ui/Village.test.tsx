/**
 * What a visitor reads on the panels of the expanded village (IMPL-0023, PROPOSTA; server-side render, no
 * browser): every panel says what is there and that it is not open, and none offers anything to buy, to claim
 * or to rent. The action button names the place the avatar stands at.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { billboardNotice, BILLBOARDS, PLOT_TIERS, RESIDENTIAL_PLOTS, SHOP_COPY, SHOPS, VILLAGE_NOTICES, VILLAGE_PLAN } from "@vila/shared/game/world";

import { type Place, useVila } from "../game/store";
import { Lot } from "./Lot";
import { BillboardPanel, PlotPanel, ShopPanel } from "./Village";
import { actionPlace, VillageActionButton } from "./VillageAction";

/** Words that would turn a placeholder into a sale: none may appear on these panels. */
const MONEY = /R\$|\bcomprar?\b|\bcompre\b|\bpreço\b|\bmoedas?\b|\bpagar\b|\bpagamento\b|\balugue\b|\bcarrinho\b/i;
/** Every button of a rendered panel except the one that closes it. */
const buttons = (html: string) => (html.match(/<button[^>]*>/g) ?? []).filter((b) => !b.includes('aria-label="Fechar"'));

afterEach(() => useVila.setState({ panel: { kind: "none" }, nearby: null, place: null }));

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

describe("contextual action of the village", () => {
  const button = (place: Place) => renderToStaticMarkup(<VillageActionButton place={place} onOpen={() => {}} />);

  it("names the place the avatar stands at, on the HUD's own action button", () => {
    expect(button({ kind: "plot", id: "economy-07" })).toContain("Ver terreno residencial");
    expect(button({ kind: "shop", id: "shop-02" })).toContain("Ver loja");
    expect(button({ kind: "billboard", id: "billboard-02" })).toContain("Ler placa");
    expect(button({ kind: "shop", id: "shop-02" })).toContain('class="btn btn--primary hud__action"');
    expect(button(null)).toBe("");
  });

  it("shows nothing away from a place, under an open panel, or while the HUD's own action is up", () => {
    const shop: Place = { kind: "shop", id: "shop-02" };
    expect(actionPlace({ panel: { kind: "none" }, nearby: null, place: shop })).toBe(shop);
    expect(actionPlace({ panel: { kind: "none" }, nearby: null, place: null })).toBeNull();
    expect(actionPlace({ panel: { kind: "missions" }, nearby: null, place: shop })).toBeNull();
    expect(actionPlace({ panel: { kind: "none" }, nearby: { kind: "tree" }, place: shop })).toBeNull();
  });

  it("opens the panel of the place: plot, shop or billboard", () => {
    const opened: unknown[] = [];
    for (const place of [{ kind: "plot", id: "economy-07" }, { kind: "shop", id: "shop-02" }, { kind: "billboard", id: "billboard-02" }] as const) {
      const el = VillageActionButton({ place, onOpen: (p) => opened.push(p) }) as { props: { children: { props: { onClick: () => void } } } };
      el.props.children.props.onClick();
    }
    expect(opened).toEqual([{ kind: "plot", plotId: "economy-07" }, { kind: "shop", shopId: "shop-02" }, { kind: "billboard", billboardId: "billboard-02" }]);
  });

  it("keeps the store's place by identity, so the frame loop writes it only when it changes", () => {
    const shop: Place = { kind: "shop", id: "shop-02" };
    let writes = 0;
    const stop = useVila.subscribe(() => writes++);
    useVila.getState().setPlace(shop);
    useVila.getState().setPlace(shop);
    useVila.getState().setPlace(null);
    useVila.getState().setPlace(null);
    stop();
    expect(writes).toBe(2);
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
