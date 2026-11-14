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

/** The parts of a villager that move on their own: the walk swings the limbs about the hips and the shoulders. */
export type VillagerPart = "body" | "legL" | "legR" | "armL" | "armR";

/**
 * A villager with each voxel tagged by the part it belongs to (IMPL-0025: the cast of the village walks).
 * `hip` and `shoulder` are the heights (voxels) the limbs turn about, `wide` the half width of the coat.
 */
export interface VillagerRig {
  voxels: Voxel[];
  part: Map<Voxel, VillagerPart>;
  hip: number;
  shoulder: number;
  wide: number;
  /** Height of the neck (the first row of the head). */
  head: number;
}

/**
 * Fixed traits of a costume (Santa, an elf, the lumberjack): a trait given here is not drawn from the seed.
 * A villager with no costume is exactly the villager the seed always gave.
 */
export interface Costume {
  skin?: string;
  hair?: string;
  coat?: string;
  pants?: string;
  boots?: string;
  legs?: 2 | 3;
  torso?: 3 | 4;
  wide?: boolean;
  buttons?: string | null;
  hem?: boolean;
  mitt?: string;
  scarf?: string | null;
  hat?: "beanie" | "top" | "earmuffs" | "cap" | "none";
  hatColor?: string;
}

export function villagerRig(seed: Seed, costume: Costume = {}): VillagerRig {
  const r = new Rng(seed, "villager");
  const skin = costume.skin ?? r.pick(SKIN), hair = costume.hair ?? r.pick(HAIR);
  const coat = costume.coat ?? r.pick(COATS), pants = costume.pants ?? r.pick([P.coal, V.blueNight, P.trunk, P.stoneDark]);
  const boots = costume.boots ?? r.pick([P.coal, V.woodDark, P.red]);
  const legH = costume.legs ?? r.int(2, 3), bodyH = costume.torso ?? r.int(3, 4), wide = costume.wide ?? r.chance(0.35);
  const v: Voxel[] = [];
  const part = new Map<Voxel, VillagerPart>();
  /** Tags what was pushed since `from` with a part; anything untagged is the body. */
  const tag = (from: number, name: VillagerPart) => {
    for (let i = from; i < v.length; i++) part.set(v[i], name);
  };
  const w = wide ? 2 : 1;
  // Legs and boots.
  for (const x of [-1, 1]) {
    const from = v.length;
    v.push([x, 0, 0, boots]);
    for (let y = 1; y < legH; y++) v.push([x, y, 0, pants]);
    tag(from, x < 0 ? "legL" : "legR");
  }
  // Coat body (two voxels deep), buttons, optional long hem over the legs.
  const y0 = legH, y1 = legH + bodyH - 1;
  box(v, -w, w, y0, y1, -1, 0, coat);
  if (costume.buttons !== null) for (let y = y0; y <= y1; y += 2) v.push([0, y, 1, costume.buttons ?? (r.chance(0.5) ? P.gold : V.creamShade)]);
  if (costume.hem ?? r.chance(0.4)) box(v, -w, w, y0 - 1, y0 - 1, -1, 0, coat);
  // Arms with mittens.
  const mitt = costume.mitt ?? r.pick(KNITS);
  for (const x of [-w - 1, w + 1]) {
    const from = v.length;
    for (let y = y1 - 2; y <= y1; y++) v.push([x, y, 0, coat]);
    v.push([x, y1 - 3, 0, mitt]);
    tag(from, x < 0 ? "armL" : "armR");
  }
  // Head with face, hair at the back.
  const hy = y1 + 1;
  box(v, -1, 1, hy, hy + 2, -1, 1, skin);
  v.push([-1, hy + 1, 1, P.coal], [1, hy + 1, 1, P.coal]); // eyes painted on the face
  box(v, -1, 1, hy, hy + 2, -1, -1, hair);
  // Scarf around the neck, with a tail.
  if (costume.scarf === undefined ? r.chance(0.7) : costume.scarf !== null) {
    const knit = costume.scarf ?? r.pick(KNITS.filter((c) => c !== coat));
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.max(Math.abs(x), Math.abs(z)) === 2) v.push([x, hy, z, knit]);
    v.push([1, hy - 1, 2, knit], [1, hy - 2, 2, knit]);
  }
  // Hat.
  const hat = costume.hat ?? r.pick(["beanie", "top", "earmuffs", "cap", "none"] as const);
  const hc = costume.hatColor ?? r.pick([...KNITS, P.coal, ...PAINTS.slice(0, 2)]);
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
  return { voxels: dedupe(v), part, hip: legH, shoulder: y1 + 1, wide: w, head: hy };
}

export function villager(seed: Seed): GenModel {
  return { voxels: villagerRig(seed).voxels, size: 0.3, idle: true };
}

export const CHARACTERS: Generator[] = [{ id: "villager", category: "characters", name: "Morador", generate: villager }];
