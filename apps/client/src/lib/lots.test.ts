import { describe, expect, it } from "vitest";

import { isUnlisted, lotLabel, UNLISTED_LABEL, withDemoHouses } from "./lots";

const lots = [
  { id: "plaza-01", state: "available", ngo_name: null },
  { id: "plaza-02", state: "published", ngo_name: "Associação Exemplo" },
  { id: "ring1-01", state: "under_review", ngo_name: null },
];

describe("the developer preview of a full village (IMPL-0031)", () => {
  it("draws every lot as a house on a local build that asks for it, and keeps a real house as it is", () => {
    const demo = withDemoHouses(lots, "?villageDemo=full", true);
    expect(demo.map((l) => l.state)).toEqual(["published", "published", "published"]);
    expect(demo[1]).toBe(lots[1]);
    // The label says what the house is: never something that reads as the name of an organisation.
    for (const lot of [demo[0], demo[2]]) expect(lot.ngo_name).toMatch(/^Casa de demonstração \d+$/);
    // The five levels of the building in turn (IMPL-0032), so the preview shows and measures every one of them.
    const many = withDemoHouses(Array.from({ length: 10 }, (_, i) => ({ id: `plaza-${i}`, state: "available", ngo_name: null })), "?villageDemo=full", true);
    expect(many.map((l) => (l as { ngo_level?: number }).ngo_level)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    // The input is not changed: nothing is written anywhere.
    expect(lots[0]).toEqual({ id: "plaza-01", state: "available", ngo_name: null });
  });

  it("does nothing on a deployed game, whatever the address says, and nothing without the parameter", () => {
    expect(withDemoHouses(lots, "?villageDemo=full", false)).toBe(lots);
    expect(withDemoHouses(lots, "", true)).toBe(lots);
    expect(withDemoHouses(lots, "?villageDemo=1", true)).toBe(lots);
  });
});

describe("a lot the API does not list", () => {
  it("is being prepared, never available; before the API answers nothing is unlisted", () => {
    const answered = { "plaza-01": lots[0] };
    expect(isUnlisted(answered, "ring4-30")).toBe(true);
    expect(lotLabel(answered, "ring4-30")).toBe(UNLISTED_LABEL);
    expect(lotLabel(answered, "plaza-01")).toBe("Terreno disponível");
    expect(isUnlisted({}, "ring4-30")).toBe(false);
  });
});
