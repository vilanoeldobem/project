/**
 * The building of an NGO on its lot, in five levels (IMPL-0032, PROPOSTA; budget: houses). The level comes from
 * the API (`LotInfo.ngo_level`, the confirmed donation total turned into 1…5) and is 1 while the feature is off.
 *
 * Every level is the chalet of the lot's own seed (`house`), so an NGO keeps its colours, its roof and the side
 * of its chimney as its building grows:
 *
 * 1. a cabin, 5 × 5, one floor;
 * 2. a chalet, 7 × 5, one floor, with a porch;
 * 3. a house, 7 × 7, two floors;
 * 4. the same with a stone turret and a string of lights under the front eave;
 * 5. three floors, a taller turret with a gold star and lights on three sides.
 *
 * All five stay inside the envelope of a lot (`HOUSE_ENVELOPE`: walls up to ±3.5 and a porch that ends 4.5 u in
 * front of the centre), so the collider of a lot never grows past its pad. No text, logo or brand, at any level.
 */
import { asNgoLevel, type NgoLevel } from "@vila/shared/game/ngo-level";
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { fillInterior } from "../villageModels";
import { house, type HouseOptions } from "./houses";
import { BULB_COLORS, V } from "./palette";
import { box, dedupe } from "./parts";
import type { Seed } from "./rng";
import type { GenModel, Generator } from "./types";

/**
 * `low` keeps the roof from being an A-frame at every level (a steep roof on a cabin stood taller than the two
 * floors of the third level); `floors` says how many floors there are.
 */
const SHAPE: Record<NgoLevel, HouseOptions & { halfWidth: number; halfDepth: number; floors: 1 | 2 | 3 }> = {
  1: { halfWidth: 2, halfDepth: 2, floors: 1, porch: 0, low: true },
  2: { halfWidth: 3, halfDepth: 2, floors: 1, porch: 1, low: true },
  3: { halfWidth: 3, halfDepth: 3, floors: 2, porch: 1, low: true },
  4: { halfWidth: 3, halfDepth: 3, floors: 2, porch: 1, low: true },
  5: { halfWidth: 3, halfDepth: 3, floors: 3, porch: 1, low: true },
};
const FLOOR_H = 3;

/** How high the short label of a published lot floats over each level. */
export const NGO_LABEL_HEIGHT: Record<NgoLevel, number> = { 1: 7.5, 2: 7.5, 3: 10.5, 4: 13, 5: 16.5 };

export function ngoBuilding(seed: Seed, level: number | null | undefined = 1): GenModel {
  const lv = asNgoLevel(level);
  const shape = SHAPE[lv];
  const model = house(seed, shape);
  // Nobody goes inside: filled, only the outside of the building is meshed.
  const v: Voxel[] = fillInterior(model.voxels, shape.halfWidth, shape.halfDepth);
  const emissive: string[] = [];
  if (lv >= 4) {
    const { halfWidth: hx, halfDepth: hz } = shape;
    const top = shape.floors * FLOOR_H - 1;
    // A stone turret at the back corner the chimney leaves free, two courses over the eaves, with a lit window
    // towards the street and a pointed cap.
    const side = -Math.sign(model.anchors?.chimney?.[0] ?? 1) || 1;
    const x0 = Math.min(side * 1, side * hx), x1 = Math.max(side * 1, side * hx);
    const turretTop = top + 3;
    box(v, x0, x1, 0, turretTop, -hz, -hz + 2, (x, y, z) => (y === turretTop - 1 && z === -hz + 2 && x === side * 2 ? P.window : y === turretTop ? P.stoneDark : (x + y + z) % 2 === 0 ? P.stone : V.stoneWarm));
    box(v, x0, x1, turretTop + 1, turretTop + 1, -hz, -hz + 2, V.redDeep);
    v.push([side * 2, turretTop + 2, -hz + 1, V.redDeep]);
    // A string of lights under the front eave.
    for (let x = -hx; x <= hx; x += 2) v.push([x, top, hz + 1, BULB_COLORS[(((x + hx) / 2) % BULB_COLORS.length)]]);
    emissive.push(...BULB_COLORS);
    if (lv === 5) {
      // The star on the turret, and the lights go round the sides.
      v.push([side * 2, turretTop + 3, -hz + 1, P.gold]);
      for (let z = -hz + 1; z <= hz; z += 2) for (const x of [-hx - 1, hx + 1]) if (!(x === side * (hx + 1) && z <= -hz + 2)) v.push([x, top, z, BULB_COLORS[((z + hz) >> 1) % BULB_COLORS.length]]);
    }
  }
  return { ...model, voxels: dedupe(v), emissive };
}

export const NGO_BUILDINGS: Generator[] = ([1, 2, 3, 4, 5] as const).map((level) => ({
  id: `ngo-level-${level}`,
  category: "houses",
  name: `Casa de ONG, nível ${level}`,
  generate: (seed) => ngoBuilding(seed, level),
}));
