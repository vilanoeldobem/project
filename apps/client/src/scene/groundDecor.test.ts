import { groundAt, WORLD_RADIUS } from "@vila/shared/game/world";
import { describe, expect, it } from "vitest";

import { DETAIL_MAX_HEIGHT, DETAIL_MODELS, DETAIL_VOXEL, detailAt, groundDetail } from "./groundDecor";
import { YARD_KINDS } from "./groundRuns";

describe("ground detail (IMPL-0035)", () => {
  const all = groundDetail(Math.floor(WORLD_RADIUS));

  it("grows only on unpaved ground: never on a road, a path, the square or a pad", () => {
    for (const d of all) expect(YARD_KINDS, `${d.kind} at ${d.x},${d.z}`).toContain(groundAt(Math.round(d.x), Math.round(d.z)));
  });

  it("stays below a hand's height, so it needs no collider and never hides a road", () => {
    for (const [kind, voxels] of Object.entries(DETAIL_MODELS)) expect(Math.max(...voxels.map((v) => v[1] + 1)) * DETAIL_VOXEL, kind).toBeLessThanOrEqual(DETAIL_MAX_HEIGHT);
  });

  it("is the same ground for every visitor and a bounded number of things", () => {
    expect(groundDetail(Math.floor(WORLD_RADIUS))).toEqual(all);
    for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) expect(detailAt(x, z)).toBe(detailAt(x, z));
    expect(all.length).toBeGreaterThan(500);
    expect(all.length).toBeLessThan(2500);
  });
});
