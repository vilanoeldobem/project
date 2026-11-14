import { COSMETICS } from "@vila/shared/game/cosmetics";
import { describe, expect, it } from "vitest";

import { measure } from "./budget";
import { itemVoxels } from "./cosmetics";

describe("cosmetic item models (IMPL-0027)", () => {
  it("covers every catalogue item and stays inside the cosmetic budget", () => {
    for (const c of COSMETICS) {
      const voxels = itemVoxels(c.id);
      if (c.id.endsWith("-none")) {
        expect(voxels, c.id).toBeNull();
        continue;
      }
      expect(voxels, c.id).not.toBeNull();
      const m = measure(voxels!);
      expect(m.voxels, c.id).toBeLessThanOrEqual(40);
      expect(m.faces, c.id).toBeLessThanOrEqual(140);
      expect(voxels!.every(([x, y, z]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)), c.id).toBe(true);
      expect(new Set(voxels!.map(([x, y, z]) => `${x},${y},${z}`)).size, c.id).toBe(voxels!.length);
    }
  });

  it("returns null for an id that is not in the catalogue", () => {
    expect(itemVoxels("nope")).toBeNull();
  });
});
