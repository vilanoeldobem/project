import { PALETTE as P, RESIDENTIAL_PLOTS } from "@vila/shared/game/world";
import { describe, expect, it } from "vitest";

import { HIDDEN, meshVoxels } from "../mesher";
import { residence } from "../villageModels";
import { house } from "./houses";
import { ngoBuilding } from "./ngoBuilding";
import { V } from "./palette";
import { REFINE, refineBuilding } from "./refine";
import { shop } from "./shops";

const toLinear = () => [1, 1, 1] as [number, number, number];
const extent = (voxels: ReadonlyArray<readonly [number, number, number, string]>, size: number, lift = 0) => {
  const drawn = voxels.filter((v) => v[3] !== HIDDEN);
  const xs = drawn.map((v) => Math.abs(v[0]) * size), zs = drawn.map((v) => Math.abs(v[2]) * size);
  return { x: Math.max(...xs) + size / 2 + lift, z: Math.max(...zs) + size / 2 + lift, y: Math.max(...drawn.map((v) => (v[1] + 1) * size)) };
};

describe("building refinement (IMPL-0035)", () => {
  const models = [house("plaza-01"), house("plaza-07"), ngoBuilding("ring2-07", 5), residence(RESIDENTIAL_PLOTS[0]), shop("shop-1")];

  it("splits blocks in three and keeps the building where it was: same footprint and height, anchors scaled", () => {
    for (const coarse of models) {
      const fine = refineBuilding(coarse);
      expect(fine.size).toBeCloseTo(coarse.size / REFINE);
      const a = extent(coarse.voxels, coarse.size), b = extent(fine.voxels, fine.size);
      // A chimney cap or a sill may stand a third of a block out; nothing more.
      expect(b.x).toBeLessThanOrEqual(a.x + coarse.size / REFINE + 1e-9);
      expect(b.z).toBeLessThanOrEqual(a.z + coarse.size / REFINE + 1e-9);
      expect(b.y).toBeLessThanOrEqual(a.y + 1e-9);
      if (coarse.anchors?.chimney) expect(fine.anchors!.chimney.map((v) => v * fine.size)).toEqual(coarse.anchors.chimney.map((v) => v * coarse.size));
      expect(fine.solid).toEqual(coarse.solid);
      expect(fine.ao).toBe(false);
    }
  });

  it("keeps lit windows, a chimney pot under the smoke, and snow as a thin cap", () => {
    for (const coarse of models.slice(0, 4)) {
      const fine = refineBuilding(coarse);
      expect(fine.voxels.some((v) => v[3] === P.window)).toBe(true);
      const [cx, cy, cz] = fine.anchors!.chimney;
      // The smoke starts above the chimney column: the top course there is the dark pot or the chimney itself.
      const top = fine.voxels.filter((v) => v[0] === cx && v[2] === cz).sort((p, q) => q[1] - p[1])[0];
      expect(top).toBeDefined();
      expect(Math.abs(top![1] + 0.5 - cy)).toBeLessThanOrEqual(1);
      expect(top![3]).toBe(V.soot);
      const snowCoarse = coarse.voxels.filter((v) => v[3] === P.snow).length;
      const snowFine = fine.voxels.filter((v) => v[3] === P.snow).length;
      if (snowCoarse) expect(snowFine).toBeLessThan(snowCoarse * REFINE ** 3 * 0.6);
    }
  });

  it("is a function of the model alone: the same building for every visitor", () => {
    const a = refineBuilding(house("ring3-17")).voxels.map((v) => v.join()).sort();
    const b = refineBuilding(house("ring3-17")).voxels.map((v) => v.join()).sort();
    expect(a).toEqual(b);
  });

  it("costs about as many faces as the coarse building it details (no ambient occlusion, hidden interior)", () => {
    for (const coarse of models) {
      const fine = refineBuilding(coarse);
      const coarseFaces = meshVoxels(coarse.voxels, { size: coarse.size, toLinear, centers: new Set() })[0].faces;
      const fineFaces = meshVoxels(fine.voxels, { size: fine.size, toLinear, centers: new Set(), ao: false })[0].faces;
      expect(fineFaces).toBeLessThan(coarseFaces * 2);
    }
  });
});
