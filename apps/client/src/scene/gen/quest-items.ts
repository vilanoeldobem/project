/**
 * Quest items and props for the quests-v1 proposal (IMPL-0010, category: props). Each generator is a pure
 * seeded recipe of parts from `./parts` and colours from `./palette`, with integer voxels grounded on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { V } from "./palette";
import { box, dedupe, disc, ground, rotate, snowCap } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const done = (v: Voxel[]) => dedupe(ground(v));

/**
 * Reindeer harness bell (`reindeer-bell`, PROPOSTA quests-v1 / `harness-bells`): flared gold/bronze bell body
 * (3–5 voxels wide, 4–5 voxels tall with clapper), coal clapper at y = 0, arched leather harness strap closed
 * with a red or pine bow, and a snowflake on top. Budget: <= 80 voxels, <= 200 faces, size 0.18, solid only.
 */
export function reindeerBell(seed: Seed): GenModel {
  const r = new Rng(seed, "quest-reindeer-bell");
  const goldSwap = r.chance(0.5);
  const main = goldSwap ? V.goldDeep : P.gold;
  const shine = goldSwap ? P.gold : V.goldDeep;
  const leather = r.pick([P.wood, V.woodDark]);
  const leatherAlt = leather === P.wood ? V.woodDark : P.wood;
  const ribbon = r.pick([P.red, P.pine]);
  const wide = r.chance(0.5);
  const bodyH = r.int(3, 4);
  const bandY = r.int(1, 2);
  const bowStyle = r.pick(["front", "wide", "side"] as const);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  // Clapper hanging at the bottom centre (y = 0).
  v.push([0, 0, 0, P.coal]);

  // Lower flared bell lip (y = 1): 5 voxels wide when flared (`wide`), 3 voxels wide when compact.
  if (wide) {
    disc(v, 0, 0, 1, 1, bandY === 1 ? shine : main);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      v.push([x, 1, z, V.crust]);
    for (const [x, z] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ])
      v.push([x, 1, z, bandY === 1 ? shine : main]);
  } else {
    box(v, -1, 1, 1, 1, -1, 1, (x, _y, z) => (Math.abs(x) === 1 && Math.abs(z) === 1 ? V.crust : bandY === 1 ? shine : main));
  }
  v.push([0, 1, wide ? 2 : 1, V.crust], [0, 1, wide ? -2 : -1, V.crust]);

  // Bell waist (y = 2 .. bodyH - 1).
  for (let y = 2; y < bodyH; y++) {
    box(v, -1, 1, y, y, -1, 1, (x, _y, z) => {
      if (y === bandY) return shine;
      if (y === 2 && Math.abs(x) === 1 && Math.abs(z) === 1) return V.crust;
      return x === -1 && z === 1 ? shine : main;
    });
  }

  // Rounded bell dome crown (y = bodyH): 5-voxel cross disc so the top tapers inward.
  disc(v, 0, 0, bodyH, 1, main);
  v.push([0, bodyH, 0, shine]);

  // Arched leather strap over the crown in P.wood and V.woodDark.
  const archY = bodyH + 1;
  v.push([-1, archY, 0, leather], [1, archY, 0, leather], [0, archY + 1, 0, leatherAlt]);
  v.push([0, archY, -1, leatherAlt]);

  // Ribbon bow in P.red or P.pine closing the strap.
  v.push([0, archY, 1, ribbon]);
  if (bowStyle === "front") {
    v.push([-1, archY, 1, ribbon], [1, archY, 1, ribbon]);
  } else if (bowStyle === "wide") {
    v.push([-1, archY, 1, ribbon], [1, archY, 1, ribbon], [0, archY - 1, 1, ribbon]);
  } else {
    v.push([1, archY, 1, ribbon], [1, archY - 1, 1, ribbon]);
  }

  // Single snowflake (P.snow) settled on top of the handle arch.
  const capped = snowCap(v, P.snow, (x, z) => x === 0 && z === 0);
  const out = turn ? rotate(capped, 1) : capped;
  return { voxels: done(out), size: 0.18 };
}

export const QUEST_ITEMS: Generator[] = [
  { id: "quest-reindeer-bell", category: "props", name: "Sino do arreio", generate: reindeerBell },
];
