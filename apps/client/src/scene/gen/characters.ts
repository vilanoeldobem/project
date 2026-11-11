/**
 * Villagers (IMPL-0010, budget: characters): neutral NPCs in the avatar's proportions (size 0.3), varying
 * body, coat, scarf, hat, hair and skin tone. No names; never a label. Front = +z.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { PAINTS, V } from "./palette";
import { box, dedupe } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const SKIN = [P.skin, V.skinLight, V.skinDeep, V.skinDark] as const;
const HAIR = [P.coal, P.trunk, V.woodLight, P.cream, P.stoneDark] as const;
const COATS = [P.red, P.pine, V.blueNight, P.wood, P.leaf, V.redDeep, P.cream] as const;
const KNITS = [P.red, P.gold, P.cream, P.pineLight, V.redBright, P.bulbBlue] as const;

export function villager(seed: Seed): GenModel {
  const r = new Rng(seed, "villager");
  const skin = r.pick(SKIN), hair = r.pick(HAIR);
  const coat = r.pick(COATS), pants = r.pick([P.coal, V.blueNight, P.trunk, P.stoneDark]);
  const boots = r.pick([P.coal, V.woodDark, P.red]);
  const legH = r.int(2, 3), bodyH = r.int(3, 4), wide = r.chance(0.35);
  const v: Voxel[] = [];
  const w = wide ? 2 : 1;
  // Legs and boots.
  for (const x of [-1, 1]) {
    v.push([x, 0, 0, boots]);
    for (let y = 1; y < legH; y++) v.push([x, y, 0, pants]);
  }
  // Coat body (two voxels deep), buttons, optional long hem over the legs.
  const y0 = legH, y1 = legH + bodyH - 1;
  box(v, -w, w, y0, y1, -1, 0, coat);
  for (let y = y0; y <= y1; y += 2) v.push([0, y, 1, r.chance(0.5) ? P.gold : V.creamShade]);
  if (r.chance(0.4)) box(v, -w, w, y0 - 1, y0 - 1, -1, 0, coat);
  // Arms with mittens.
  const mitt = r.pick(KNITS);
  for (const x of [-w - 1, w + 1]) {
    for (let y = y1 - 2; y <= y1; y++) v.push([x, y, 0, coat]);
    v.push([x, y1 - 3, 0, mitt]);
  }
  // Head with face, hair at the back.
  const hy = y1 + 1;
  box(v, -1, 1, hy, hy + 2, -1, 1, skin);
  v.push([-1, hy + 1, 1, P.coal], [1, hy + 1, 1, P.coal]); // eyes painted on the face
  box(v, -1, 1, hy, hy + 2, -1, -1, hair);
  // Scarf around the neck, with a tail.
  if (r.chance(0.7)) {
    const knit = r.pick(KNITS.filter((c) => c !== coat));
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.max(Math.abs(x), Math.abs(z)) === 2) v.push([x, hy, z, knit]);
    v.push([1, hy - 1, 2, knit], [1, hy - 2, 2, knit]);
  }
  // Hat.
  const hat = r.pick(["beanie", "top", "earmuffs", "cap", "none"] as const);
  const hc = r.pick([...KNITS, P.coal, ...PAINTS.slice(0, 2)]);
  const ty = hy + 3;
  if (hat === "beanie") {
    box(v, -1, 1, ty, ty, -1, 1, hc);
    v.push([0, ty + 1, 0, P.cream]);
  } else if (hat === "top") {
    box(v, -2, 2, ty, ty, -2, 2, P.coal);
    box(v, -1, 1, ty + 1, ty + 2, -1, 1, P.coal);
    box(v, -1, 1, ty + 1, ty + 1, 1, 1, P.red);
  } else if (hat === "earmuffs") {
    box(v, -1, 1, ty, ty, -1, 1, hair);
    v.push([-2, hy + 1, 0, hc], [2, hy + 1, 0, hc], [-2, hy + 2, 0, hc], [2, hy + 2, 0, hc]);
  } else if (hat === "cap") {
    box(v, -1, 1, ty, ty, -1, 1, hc);
    box(v, -1, 1, ty - 1, ty - 1, 2, 2, hc);
  } else box(v, -1, 1, ty, ty, -1, 1, hair);
  return { voxels: dedupe(v), size: 0.3, idle: true };
}

export const CHARACTERS: Generator[] = [{ id: "villager", category: "characters", name: "Morador", generate: villager }];
