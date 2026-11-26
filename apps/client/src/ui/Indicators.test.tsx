import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IndicatorCard, UsageCoverage } from "./Indicators";

describe("public indicator units", () => {
  it.each([
    ["confirmed_amount", 1725, "R$ 17,25"],
    ["confirmed_amount", 0, "R$ 0,00"],
    ["confirmed_amount", null, "—"],
    ["confirmed_donations", 1725, "1.725"],
    ["approved_ngos", 0, "0"],
  ] as const)("renders %s value %s as %s", (key, value, expected) => {
    const html = renderToStaticMarkup(<IndicatorCard indicator={{ key, label: "Teste", value, note: "Fonte indisponível." }} />);
    expect(html).toContain(`<strong>${expected}</strong>`);
    expect(html.includes("Fonte indisponível.")).toBe(value === null);
  });
});

describe("public usage coverage", () => {
  it("explains missing usage figures and the square's connections on a legacy response", () => {
    const html = renderToStaticMarkup(<UsageCoverage indicators={[{ key: "registered_users", label: "Contas", value: 0 }]} />);
    expect(html).toContain("visitantes únicos desde o lançamento, visitas por casa de ONG e jogadores por minijogo");
    expect(html).toContain("duas abas");
  });

  it("only lists absent keys, preserving the cards for measured zero and an explicit null", () => {
    const indicators = [
      { key: "unique_visitors", label: "Visitantes", value: 0 },
      { key: "players_by_minigame", label: "Jogadores", value: null, note: "Em verificação." },
    ];
    const html = renderToStaticMarkup(<UsageCoverage indicators={indicators} />);
    expect(html).toContain("Sem medição disponível para visitas por casa de ONG.");
    expect(html).not.toContain("duas abas");
    expect(html).not.toContain("jogadores por minijogo");
    expect(renderToStaticMarkup(<UsageCoverage indicators={[...indicators, { key: "visits_by_ngo_house", label: "Visitas", value: 1 }]} />)).toBe("");
  });
});
