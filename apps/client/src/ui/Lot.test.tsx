/**
 * The lot sheet (P03/P04), server-side: the states a visitor can meet, the two actions of an available lot,
 * the sections of a published house and the absent gallery when the API has no photos. Donation calls live in
 * effects and never run here.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LotInfo } from "../lib/api";
import { Lot } from "./Lot";

const available: LotInfo = { id: "plaza-03", state: "available", ngo_id: null, ngo_name: null, ngo_summary: null };
const reviewing: LotInfo = { id: "plaza-03", state: "under_review", ngo_id: null, ngo_name: null, ngo_summary: null };
const published: LotInfo = {
  id: "plaza-03",
  state: "published",
  ngo_id: "ngo-1",
  ngo_name: "Associação Exemplo",
  ngo_summary: "Apoio escolar no contraturno.",
  ngo_logo: null,
};

/** Reads the store at render time: the server snapshot of a zustand hook is its initial state. */
const live = <S,>(store: { getState: () => S }) =>
  Object.assign((select?: (s: S) => unknown) => (select ? select(store.getState()) : store.getState()), store);

afterEach(() => {
  vi.doUnmock("../lib/account");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the lot sheet (P03)", () => {
  it("offers the application and the invite on an available lot, with the publication flow", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
    // The hook is replaced after a fresh module load, so the server render reads the live store (same pattern as
    // Moderation.test): a static import would keep the un-mocked hook and its initial state.
    const account = await import("../lib/account");
    vi.doMock("../lib/account", () => ({ ...account, useAccount: live(account.useAccount) }));
    const { Lot: LiveLot } = await import("./Lot");
    account.useAccount.setState({ enabled: true, donations: false, user: null });

    const html = renderToStaticMarkup(<LiveLot lotId="plaza-03" info={available} />);
    expect(html).toContain('aria-label="Terreno disponível"');
    expect(html).toContain('data-board="P03"');
    expect(html).toContain("Candidatar minha ONG");
    expect(html).toContain("Indicar uma ONG");
    expect(html).toContain("CNPJ ativo.");
    expect(html).toContain("Casa publicada após aprovação");

    const review = renderToStaticMarkup(<LiveLot lotId="plaza-03" info={reviewing} />);
    expect(review).toContain('aria-label="Em análise — casa ainda não publicada"');
    expect(review).toContain("Candidatura em análise");
    expect(review).toContain("Indicar uma ONG");
  });
});

describe("the published house (P04)", () => {
  it("shows the sections of the board, without a gallery while the API has no photos", () => {
    const html = renderToStaticMarkup(<Lot lotId="plaza-03" info={published} />);
    expect(html).toContain('aria-label="Associação Exemplo"');
    expect(html).toContain('data-board="P04"');
    expect(html).toContain("Sobre a ONG");
    expect(html).toContain("Apoio escolar no contraturno.");
    expect(html).toContain("Doação voluntária");
    expect(html).toContain("Destinatário: esta ONG");
    expect(html).toContain("Doar é voluntário. Jogar nunca é uma doação.");
    expect(html).toContain("Jogue gratuitamente");
    expect(html).toContain("Jogar gratuitamente");
    expect(html).not.toContain("Fotos");
  });
});
