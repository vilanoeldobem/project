import { describe, expect, it } from "vitest";

import { LOTS, RESIDENTIAL_PLOTS, SHOPS } from "@vila/shared/game/world";

import { MAP_SIZE, mapDots, mapToSvg } from "./map";

describe("the schematic map (P10)", () => {
  it("places every lot, shop and residential plot inside the canvas", () => {
    const dots = mapDots({});
    expect(dots).toHaveLength(LOTS.length + SHOPS.length + RESIDENTIAL_PLOTS.length);
    for (const dot of dots) {
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThanOrEqual(MAP_SIZE);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThanOrEqual(MAP_SIZE);
    }
  });

  it("follows the lot states the API answered, and calls an unanswered lot unknown", () => {
    const first = LOTS[0];
    const dots = mapDots({ [first.id]: { id: first.id, state: "published", ngo_id: "ngo-1", ngo_name: "Associação Exemplo", ngo_summary: null } });
    const published = dots.find((d) => d.id === first.id);
    expect(published?.state).toBe("published");
    expect(published?.label).toBe("Associação Exemplo");
    expect(dots.filter((d) => d.kind === "lot").every((d) => d.state === "unknown" || d.id === first.id)).toBe(true);
  });

  it("maps the world origin to the centre and keeps the sign of both axes", () => {
    expect(mapToSvg(0, 0)).toEqual({ x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
    expect(mapToSvg(10, 0).x).toBeGreaterThan(MAP_SIZE / 2);
    expect(mapToSvg(0, -10).y).toBeLessThan(MAP_SIZE / 2);
  });
});
