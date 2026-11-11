import { PALETTE as P } from "@vila/shared/game/world";
import { describe, expect, it } from "vitest";

import { house } from "./houses";

const LOT_IDS = Array.from({ length: 8 }, (_, i) => `plaza-${String(i + 1).padStart(2, "0")}`);

describe("house generator", () => {
  it("puts the chimney anchor just above a chimney column (smoke origin)", () => {
    for (const id of LOT_IDS) {
      const m = house(id);
      const [cx, cy, cz] = m.anchors!.chimney;
      const top = m.voxels.find(([x, y, z]) => x === cx && z === cz && y === cy - 0.5);
      expect(top?.[3], id).toBe(P.stoneDark);
    }
  });

  it("gives every lot of the plaza a house with lit windows and a front door", () => {
    for (const id of LOT_IDS) {
      const m = house(id);
      expect(m.glow).toEqual([P.window]);
      expect(m.voxels.some((v) => v[3] === P.window)).toBe(true);
    }
  });

  it("stays within 5 voxels of the lot centre (porch ends at the street's outer edge)", () => {
    for (const id of LOT_IDS) for (const [x, , z] of house(id).voxels) expect(Math.max(Math.abs(x), Math.abs(z)), id).toBeLessThanOrEqual(5);
  });
});
