/**
 * Christmas shops (IMPL-0023, PROPOSTA; budget: houses). A low building on the square's frontage: stone
 * base, painted walls, a door between two lit display windows, a striped awning above head height and a
 * flat stepped roof that carries the billboard frame. Front = +z. No text, logo or brand in the model: the
 * shop's name is a flat label and its notice a billboard (`village.ts`). The walls fill the footprint every
 * shop shares (`SHOP_SOLID` in the shared world).
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { AWNINGS, V } from "./palette";
import { box, dedupe, snowCap } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const WALLS = [P.cream, P.red, P.pine, V.woodLight, V.blueNight] as const;
const ROOFS = [P.terracotta, V.redDeep, P.stoneDark, V.woodDark] as const;
const HALF = 3;
const WALL_TOP = 3;

export function shop(seed: Seed): GenModel {
  const r = new Rng(seed, "shop");
  const wall = r.pick(WALLS);
  const trim = r.pick([P.cream, V.creamShade, V.woodDark, P.gold].filter((c) => c !== wall));
  const roof = r.pick(ROOFS.filter((c) => c !== wall));
  const [a, b] = r.pick(AWNINGS);
  const door = r.pick([P.gold, V.woodDark, P.red, P.pine].filter((c) => c !== wall));
  const wide = r.chance(0.5);
  const v: Voxel[] = [];

  for (let y = 0; y <= WALL_TOP; y++)
    for (let x = -HALF; x <= HALF; x++)
      for (let z = -HALF; z <= HALF; z++) {
        if (Math.abs(x) < HALF && Math.abs(z) < HALF) continue;
        const corner = Math.abs(x) === HALF && Math.abs(z) === HALF;
        const front = z === HALF;
        const isDoor = front && x === 0 && y < 2;
        // Display windows on the front, a small window on each side wall.
        const display = front && y >= 1 && y <= 2 && (wide ? Math.abs(x) === 1 || Math.abs(x) === 2 : Math.abs(x) === 2);
        const side = Math.abs(x) === HALF && z === 0 && y === 2;
        v.push([x, y, z, isDoor ? door : display || side ? P.window : corner ? V.woodDark : y === 0 ? P.stoneDark : y === WALL_TOP ? trim : wall]);
      }

  // Awning over the shop front, above every head: it never blocks the avatar.
  for (let x = -HALF; x <= HALF; x++) v.push([x, WALL_TOP, HALF + 1, Math.floor((x + 64) / 2) % 2 ? a : b]);
  // Flat stepped roof with an overhang; the billboard frame stands on the upper step.
  box(v, -HALF - 1, HALF + 1, WALL_TOP + 1, WALL_TOP + 1, -HALF - 1, HALF + 1, roof);
  box(v, -HALF, HALF, WALL_TOP + 2, WALL_TOP + 2, -HALF, HALF, roof);
  // A wreath over the door.
  if (r.chance(0.7)) v.push([-1, WALL_TOP, HALF + 1, P.pineLight], [1, WALL_TOP, HALF + 1, P.pineLight], [0, WALL_TOP, HALF + 1, P.red]);

  const snowy = snowCap(dedupe(v), P.snow, (x, z) => (x * 3 + z * 5) % 4 !== 0 && z !== HALF + 1 && Math.abs(x) <= HALF + 1);
  return { voxels: dedupe(snowy), size: 1, glow: [P.window], solid: [[-HALF - 0.5, HALF + 0.5, -HALF - 0.5, HALF + 0.5]] };
}

export const SHOPS: Generator[] = [{ id: "shop", category: "houses", name: "Loja de Natal", generate: shop }];
