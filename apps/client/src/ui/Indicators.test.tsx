import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IndicatorCard } from "./Indicators";

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
