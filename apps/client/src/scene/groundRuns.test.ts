import { describe, expect, it } from "vitest";

import { type GroundKind, groundAt, PALETTE as P, WORLD_RADIUS } from "@vila/shared/game/world";

import { cellColor, GROUND_SECTORS, groundColor, groundPiece, groundRuns, ROAD_KINDS, ROAD_TONES, YARD_KINDS, YARD_TONES } from "./groundRuns";

/** WCAG relative luminance of an sRGB hex colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

describe("ground runs (IMPL-0024)", () => {
  const radius = Math.ceil(WORLD_RADIUS) + 3;
  const runs = groundRuns(radius);

  it("covers every cell of the disc exactly once, with the colour of the cell", () => {
    let cells = 0;
    for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) if (Math.hypot(x, z) <= radius) cells++;
    expect(runs.reduce((n, [x0, x1]) => n + (x1 - x0 + 1), 0)).toBe(cells);
    const seen = new Set<string>();
    for (const [x0, x1, z, c] of runs)
      for (let x = x0; x <= x1; x++) {
        expect(seen.has(`${x},${z}`)).toBe(false);
        seen.add(`${x},${z}`);
        expect(c).toBe(cellColor(x, z));
      }
  });

  it("stays within its budget: under half a quad per cell, whatever the village paints", () => {
    // 32 700 cells over the village of four rings (IMPL-0031); pavers alternate cell by cell, grass and roads
    // merge into long runs.
    const cells = runs.reduce((n, [x0, x1]) => n + (x1 - x0 + 1), 0);
    expect(runs.length).toBeGreaterThan(3000);
    expect(runs.length).toBeLessThan(cells / 2);
    expect(runs.length).toBeLessThan(16000);
  });

  it("is drawn in pieces the camera can cull: the middle of the village and a sector for each side", () => {
    const sizes = Array.from({ length: GROUND_SECTORS + 1 }, () => 0);
    for (const run of runs) sizes[groundPiece(run)]++;
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(runs.length);
    for (const n of sizes) expect(n).toBeGreaterThan(0);
    // No piece is most of the ground, and the sectors are about the same size.
    expect(Math.max(...sizes)).toBeLessThan(runs.length / 4);
    expect(Math.max(...sizes.slice(1)) / Math.min(...sizes.slice(1))).toBeLessThan(1.6);
    // A run is in the middle piece when its middle is, and never in two.
    expect(groundPiece([-2, 2, 0, "#000000"])).toBe(0);
    expect(groundPiece([60, 64, 1, "#000000"])).not.toBe(groundPiece([-64, -60, -1, "#000000"]));
  });

  it("is deterministic", () => {
    expect(groundRuns(radius)).toEqual(runs);
  });
});

describe("the thawed ground (IMPL-0030)", () => {
  const radius = Math.ceil(WORLD_RADIUS) + 3;
  /** Every colour painted on each kind of ground, over the whole disc. */
  const painted = new Map<GroundKind, Set<string>>();
  const cells = new Map<string, number>();
  let total = 0;
  for (let x = -radius; x <= radius; x++)
    for (let z = -radius; z <= radius; z++) {
      if (Math.hypot(x, z) > radius) continue;
      const kind = groundAt(x, z), colour = cellColor(x, z);
      painted.set(kind, (painted.get(kind) ?? new Set()).add(colour));
      // The share of white is measured inside the village: the ring of snow at the edge frames it on purpose.
      if (Math.hypot(x, z) <= WORLD_RADIUS - 6) {
        cells.set(colour, (cells.get(colour) ?? 0) + 1);
        total++;
      }
    }
  const junction = [P.paver, P.paverDark];

  it("paints every road in a road tone (a junction is paved) and every yard in a yard tone or as a kerb", () => {
    for (const kind of ROAD_KINDS) for (const c of painted.get(kind) ?? []) expect([...ROAD_TONES, ...junction], `${kind} ${c}`).toContain(c);
    for (const kind of YARD_KINDS) for (const c of painted.get(kind) ?? []) expect([...YARD_TONES, P.kerb], `${kind} ${c}`).toContain(c);
    // Every road kind and every yard kind of the plan in force is on the ground.
    for (const kind of [...ROAD_KINDS, ...YARD_KINDS]) expect(painted.get(kind)?.size ?? 0, kind).toBeGreaterThan(0);
  });

  it("keeps a contrast of at least 3:1 between every road tone and every yard tone", () => {
    for (const road of ROAD_TONES) for (const yard of YARD_TONES) expect(contrast(road, yard), `${road} on ${yard}`).toBeGreaterThanOrEqual(3);
    // The kerb is a light line along a dark road.
    for (const road of ROAD_TONES) expect(contrast(road, P.kerb), `${road} kerb`).toBeGreaterThanOrEqual(4.5);
  });

  it("draws a kerb along both sides of a road and never on the road itself", () => {
    // The standard street of the east side runs along z at x ≈ 53: grass, kerb, road, kerb, grass.
    const row = Array.from({ length: 12 }, (_, i) => ({ x: 48 + i, kind: groundAt(48 + i, 10), colour: cellColor(48 + i, 10) }));
    const road = row.filter((c) => (ROAD_KINDS as readonly string[]).includes(c.kind));
    expect(road.length).toBeGreaterThanOrEqual(4);
    for (const c of road) expect(ROAD_TONES).toContain(c.colour);
    const before = row[row.indexOf(road[0]) - 1], after = row[row.indexOf(road[road.length - 1]) + 1];
    expect(before.colour).toBe(P.kerb);
    expect(after.colour).toBe(P.kerb);
    // A cell away from every road is never a kerb.
    expect(cellColor(22, 0)).not.toBe(P.kerb);
  });

  it("keeps snow an accent inside the village: under a fifth of the ground is a snow tone", () => {
    const white = [P.snow, P.snowShade, P.snowDeep].reduce((n, c) => n + (cells.get(c) ?? 0), 0);
    expect(white / total).toBeGreaterThan(0.03);
    expect(white / total).toBeLessThan(0.2);
  });

  it("turns to snow at the edge of the world, where the snowfield begins", () => {
    for (const [x, z] of [[radius - 1, 0], [0, radius - 1], [-radius + 1, 0]]) expect([P.snow, P.snowShade, P.snowDeep]).toContain(groundColor("snow", x, z));
  });
});
