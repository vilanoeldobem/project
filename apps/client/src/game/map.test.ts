import { describe, expect, it } from "vitest";

import { LOTS, RESIDENTIAL_PLOTS, SHOPS, SITES } from "@vila/shared/game/world";

import { avenueLines, MAP_SIZE, mapDots, mapToSvg, ringStreets } from "./map";

describe("the schematic map (P10)", () => {
  it("places every lot, shop, residential plot, civic building, park and square inside the canvas", () => {
    const dots = mapDots({});
    expect(dots).toHaveLength(LOTS.length + SHOPS.length + RESIDENTIAL_PLOTS.length + SITES.length);
    expect(new Set(dots.map((d) => d.id)).size).toBe(dots.length);
    // No two lots cover each other: the dots of neighbours on the same street are apart by more than their size.
    const lots = dots.filter((d) => d.kind === "lot");
    for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) expect(Math.hypot(lots[i].x - lots[j].x, lots[i].y - lots[j].y), `${lots[i].id} ${lots[j].id}`).toBeGreaterThan(lots[i].r + lots[j].r);
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

  it("draws the street of every ring inside the canvas, the next one farther out, and the avenues to the end of the village", () => {
    const streets = ringStreets();
    expect(streets.map((s) => s.id)).toEqual(["ring1", "ring2", "ring3", "ring4"]);
    for (let i = 1; i < streets.length; i++) expect(streets[i].apothem).toBeGreaterThan(streets[i - 1].apothem + streets[i - 1].width);
    expect(streets[streets.length - 1].apothem / Math.cos(Math.PI / 8)).toBeLessThan(MAP_SIZE / 2);
    for (const line of avenueLines()) expect(Math.hypot(line.x2 - MAP_SIZE / 2, line.y2 - MAP_SIZE / 2)).toBeGreaterThan(streets[streets.length - 1].apothem);
  });

  it("maps the world origin to the centre and keeps the sign of both axes", () => {
    expect(mapToSvg(0, 0)).toEqual({ x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
    expect(mapToSvg(10, 0).x).toBeGreaterThan(MAP_SIZE / 2);
    expect(mapToSvg(0, -10).y).toBeLessThan(MAP_SIZE / 2);
  });
});
