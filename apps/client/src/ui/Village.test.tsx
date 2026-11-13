/**
 * What a visitor reads on the panels of the expanded village (IMPL-0024, PROPOSTA; server-side render, no
 * browser): each panel says what is there in neutral words. None presents an undecided proposal as something
 * that is coming, and none offers anything to buy, to claim or to rent. They are ordinary panels (veil, Escape,
 * the walk held). The action that opens them is the HUD's one contextual action (`Hud.test.tsx`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { attainableLevel } from "@vila/shared/game/progress";
import { billboardNotice, BILLBOARDS, LOTS, PLOT_TIERS, plotLabel, RESIDENTIAL_PLOTS, SHOP_COPY, SHOPS, VILLAGE_NOTICES, VILLAGE_PLAN } from "@vila/shared/game/world";

import { sim, walkRoute } from "../game/sim";
import { useVila } from "../game/store";
import { pressEscape } from "../lib/escape";
import { useAccount } from "../lib/account";
import type { LotInfo } from "../lib/api";
import { isUnlisted, lotLabel, UNLISTED_LABEL } from "../lib/lots";
import { Donation } from "./Donation";
import { Explore } from "./Explore";
import { Lot } from "./Lot";
import { BillboardPanel, PlotPanel, PlotPanelView, ShopPanel } from "./Village";

/** Words that would turn a placeholder into a sale: none may appear on these panels. */
const MONEY = /R\$|\bcomprar?\b|\bcompre\b|\bpreço\b|\bmoedas?\b|\bpagar\b|\bpagamento\b|\balug\w+\b|\bcarrinho\b/i;
/** Words that would present an undecided proposal as something that is coming. */
const PROMISE = /em breve|será liberad|vai ser liberad|quando abrir|você vai|logo mais|aguarde/i;
/** Internal ids and tier names: the panels show friendly pt-BR labels instead. */
const RAW = /premium|standard|economy|padrão|econômic|shop-\d|billboard-\d|<code>/i;
/** Every button of a rendered panel except the one that closes it. */
const buttons = (html: string) => (html.match(/<button[^>]*>/g) ?? []).filter((b) => !b.includes('aria-label="Fechar"'));
/** What a visitor reads: the markup without tags and attributes (ids for tests live in `data-` attributes). */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

afterEach(() => useVila.setState({ panel: { kind: "none" }, menu: null, nearby: null }));

describe("residential plot panel", () => {
  const NEUTRAL = "Os terrenos residenciais não têm dono. A posse por jogadores é uma proposta em estudo e ainda não foi decidida.";

  it.each(PLOT_TIERS)("says the plot, its neighbourhood and one neutral statement while ownership is off (%s)", (tier) => {
    const plot = RESIDENTIAL_PLOTS.find((p) => p.tier === tier && p.slot === 12)!;
    const html = renderToStaticMarkup(<PlotPanel plotId={plot.id} />);
    const read = text(html);
    expect(read).toContain(NEUTRAL);
    expect(read).toContain(`Terreno 12 · ${VILLAGE_PLAN.tiers[tier].label}`);
    expect(html).toContain('role="dialog"');
    // The id is there for tests and tools, not for the visitor.
    expect(html).toContain(`data-plot-id="${plot.id}"`);
    expect(RAW.test(read)).toBe(false);
    // Nothing that is not decided: no "soon", no requirement, no level.
    expect(PROMISE.test(read)).toBe(false);
    expect(/requisito|nível|missões|situação/i.test(read)).toBe(false);
    expect(MONEY.test(read)).toBe(false);
    expect(buttons(html)).toEqual([]);
  });

  it("names the three neighbourhoods apart, with words that carry no price", () => {
    const names = PLOT_TIERS.map((tier) => VILLAGE_PLAN.tiers[tier].label);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name).toMatch(/^Bairro d[aeo] /);
      expect(/premium|padrão|econ|luxo|nobre|popular|básic|vip|ouro|prata|bronze/i.test(name)).toBe(false);
    }
    expect(plotLabel(RESIDENTIAL_PLOTS[0])).toBe(`Terreno 1 · ${names[0]}`);
  });

  it("is the same neutral panel when the API cannot be read or answers every plot unavailable", () => {
    const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-07")!;
    const off = renderToStaticMarkup(<PlotPanelView plot={plot} enabled={false} state="unavailable" level={1} quests={false} />);
    expect(off).toBe(renderToStaticMarkup(<PlotPanel plotId="economy-07" />));
    // A state alone opens nothing: the requirement and the state appear only with the flag on.
    expect(renderToStaticMarkup(<PlotPanelView plot={plot} enabled={false} state="available" level={4} quests />)).toBe(off);
  });

  it.each(PLOT_TIERS)("shows the requirement only with the flag on, and says when no open mission reaches it (%s)", (tier) => {
    const plot = RESIDENTIAL_PLOTS.find((p) => p.tier === tier)!;
    const level = VILLAGE_PLAN.tiers[tier].requirement.level;
    for (const quests of [false, true]) {
      const read = text(renderToStaticMarkup(<PlotPanelView plot={plot} enabled state="available" level={1} quests={quests} />));
      expect(read).toContain(`Chegar ao nível ${level} jogando.`);
      expect(read).toContain("proposta em estudo");
      const reachable = level <= attainableLevel(quests);
      expect(read.includes("Com as missões abertas hoje ainda não dá para chegar a esse nível."), `${tier}, quests ${quests}`).toBe(!reachable);
      // Still nothing to claim, nothing promised and nothing sold.
      expect(read).toContain("Ainda não é possível pedir um terreno.");
      expect(PROMISE.test(read)).toBe(false);
      expect(MONEY.test(read)).toBe(false);
      expect(RAW.test(read)).toBe(false);
    }
  });

  it("asks of every tier a level the missions can reach: with the quests on, all three; with them off, the outer one", () => {
    const levels = PLOT_TIERS.map((tier) => VILLAGE_PLAN.tiers[tier].requirement.level);
    for (const level of levels) expect(level).toBeLessThanOrEqual(attainableLevel(true));
    expect(levels.map((level) => level <= attainableLevel(false))).toEqual([false, false, true]);
  });

  it("draws nothing for an id that is not a plot", () => {
    expect(renderToStaticMarkup(<PlotPanel plotId="plaza-01" />)).toBe("");
  });
});

describe("shop panel", () => {
  it.each(SHOPS.map((s) => s.id))("says the name and the theme of %s and that it has not opened, with no promise of sales", (id) => {
    const html = renderToStaticMarkup(<ShopPanel shopId={id} />);
    const read = text(html);
    const copy = SHOP_COPY[SHOPS.findIndex((s) => s.id === id)];
    expect(read).toContain(copy.name);
    expect(read).toContain(`Tema: ${copy.theme}.`);
    expect(read).toContain("Esta loja ainda não abriu.");
    expect(read).toContain("Se e como ela vai funcionar ainda não foi decidido.");
    expect(read).toContain("Nada é vendido na Vila.");
    expect(html).toContain(`data-shop-id="${id}"`);
    expect(RAW.test(read)).toBe(false);
    expect(PROMISE.test(read)).toBe(false);
    expect(MONEY.test(read)).toBe(false);
    expect(buttons(html)).toEqual([]);
  });

  it("gives every shop its own name and theme, none of them a brand or a promise", () => {
    expect(new Set(SHOPS.map((s) => SHOP_COPY[SHOPS.indexOf(s)].name)).size).toBe(SHOPS.length);
    for (const copy of SHOP_COPY) expect(/para (o seu|a sua|você|decorar)|seu visual|sua casa/i.test(copy.theme)).toBe(false);
    expect(renderToStaticMarkup(<ShopPanel shopId="shop-99" />)).toBe("");
  });
});

describe("billboard panel", () => {
  it.each(BILLBOARDS.map((b) => b.id))("shows the notice of %s as text and says the signs carry the village's own notices, nothing else", (id) => {
    const html = renderToStaticMarkup(<BillboardPanel billboardId={id} />);
    const read = text(html);
    expect(read).toContain(billboardNotice(id));
    expect(read).toContain("As placas mostram avisos da própria Vila.");
    expect(html).toContain(`data-billboard-id="${id}"`);
    // No renting, and no "not yet" that would announce it.
    expect(/ainda não|por enquanto|disponível/i.test(read)).toBe(false);
    expect(MONEY.test(read)).toBe(false);
    expect(RAW.test(read)).toBe(false);
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
  const eight = Object.fromEntries(LOTS.slice(0, 8).map((l) => [l.id, { id: l.id, state: "available", ngo_name: null, ngo_summary: null } as LotInfo]));

  it("says it is being prepared, with no invitation to apply, on a lot older databases do not have (before migration 0012)", () => {
    const html = renderToStaticMarkup(<Lot lotId="plaza-12" unlisted />);
    const read = text(html);
    expect(html).toContain(`aria-label="${UNLISTED_LABEL}"`);
    expect(read).toContain("Terreno 12");
    expect(read).toContain("Este terreno ainda não recebe candidaturas.");
    for (const invitation of ["Sua ONG pode estar aqui", "Terreno disponível para", "Critérios para participar", "Candidatar minha ONG", "Conheça o cadastro", "abre em breve"]) expect(read, invitation).not.toContain(invitation);
    expect(buttons(html)).toEqual([]);
    // A lot the API lists keeps the invitation.
    expect(text(renderToStaticMarkup(<Lot lotId="plaza-01" info={eight["plaza-01"]} />))).toContain("Sua ONG pode estar aqui");
  });

  it("labels it the same way in 3D: never as available", () => {
    expect(UNLISTED_LABEL).toBe("Terreno em preparação");
    expect(LOTS.map((l) => lotLabel(eight, l.id))).toEqual([...Array(8).fill("Terreno disponível"), ...Array(4).fill(UNLISTED_LABEL)]);
    expect(lotLabel({ ...eight, "plaza-03": { ...eight["plaza-03"], state: "published", ngo_name: "Associação Exemplo" } }, "plaza-03")).toBe("Associação Exemplo");
    // Before the API answers (or when it cannot be read) nothing is known to be unlisted.
    expect(isUnlisted({}, "plaza-12")).toBe(false);
    expect(lotLabel({}, "plaza-12")).toBe("Terreno disponível");
  });
});

describe("a published house on one of the new lots and the donations of IMPL-0023", () => {
  const house = (lot: string): LotInfo => ({ id: lot, state: "published", ngo_id: "a0000000-0000-4000-8000-000000000001", ngo_name: "Associação Exemplo", ngo_summary: "Resumo público" }) as LotInfo;
  afterEach(() => useAccount.setState({ donations: false }));

  it.each(["plaza-09", "plaza-10", "plaza-11", "plaza-12"])("%s with donations off: the disabled button and the honest note, no payment", (lot) => {
    expect(useAccount.getState().donations).toBe(false);
    const html = renderToStaticMarkup(<Lot lotId={lot} info={house(lot)} />);
    expect(html).toContain(`Terreno ${Number(lot.slice(-2))}`);
    expect(html).toContain("Destinatário: esta ONG");
    expect(html).toMatch(/<button class="btn btn--primary" disabled="">Doar para esta ONG<\/button>/);
    expect(html).toContain("Pagamento ainda não habilitado (PEN-006).");
    expect(html).not.toMatch(/Pix|QR Code|Gerar|página de pagamento/);
    // The only other button of the house is the free game.
    expect(buttons(html).filter((b) => !b.includes("disabled"))).toHaveLength(1);
  });

  it("is the same panel a house on an old lot gets", () => {
    const strip = (html: string) => html.replace(/Terreno \d+/g, "Terreno N");
    expect(strip(renderToStaticMarkup(<Lot lotId="plaza-12" info={house("plaza-12")} />))).toBe(strip(renderToStaticMarkup(<Lot lotId="plaza-01" info={house("plaza-01")} />)));
  });

  it("the global donation, reached from the HUD, the tree or the lectern, stays disabled and honest with donations off", () => {
    const html = renderToStaticMarkup(<Donation />);
    expect(html).toMatch(/<button class="btn btn--primary" disabled=""[^>]*>Doar<\/button>/);
    expect(html).toContain("Doações ficam disponíveis após a definição e o contrato da instituição parceira.");
    expect(html).toContain("não é dividida entre as ONGs da Vila");
    expect(html).not.toMatch(/QR Code|Gerar Pix/);
  });
});

describe("Explorar ONGs with the 12 lots of the frontage", () => {
  /** One row per lot: its name and its state, as shown. */
  const rows = (lots: Record<string, LotInfo>) =>
    [...renderToStaticMarkup(<Explore lots={lots} />).matchAll(/<li><span><strong>(.*?)<\/strong><small>(.*?)<\/small><\/span><button class="btn btn--small">Ir até lá<\/button><\/li>/g)].map((m) => [m[1], m[2]]);
  const info = (id: string, state: LotInfo["state"], ngo_name: string | null = null) => ({ id, state, ngo_name }) as LotInfo;

  it("lists every lot once, each with its way there", () => {
    expect(LOTS).toHaveLength(12);
    const all = Object.fromEntries(LOTS.map((l) => [l.id, info(l.id, "available")]));
    expect(rows(all)).toEqual(LOTS.map((l) => [`Terreno ${l.slot}`, "Terreno disponível"]));
    expect(new Set(LOTS.map((l) => l.slot)).size).toBe(12);
  });

  it("names a published house and counts it", () => {
    const all = Object.fromEntries(LOTS.map((l) => [l.id, info(l.id, "available")]));
    all["plaza-12"] = info("plaza-12", "published", "Associação Exemplo");
    expect(rows(all).at(-1)).toEqual(["Associação Exemplo", "Casa publicada"]);
    expect(renderToStaticMarkup(<Explore lots={all} />)).toContain("1 casa publicada na praça.");
  });

  it("does not call a lot available when the API does not list it (a database before migration 0012)", () => {
    const eight = Object.fromEntries(LOTS.slice(0, 8).map((l) => [l.id, info(l.id, "available")]));
    expect(rows(eight).map((r) => r[1])).toEqual([...Array(8).fill("Terreno disponível"), ...Array(4).fill(UNLISTED_LABEL)]);
  });
});
