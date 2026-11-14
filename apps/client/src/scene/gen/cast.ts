/**
 * The cast of the village (IMPL-0025, PROPOSTA; budget: characters and animals): every character of
 * `LIFE_CAST` as a rig, a voxel model cut into rigid parts that turn about a pivot. Built with the generators
 * that already drew the villagers and the animals (same seed, same look); the Christmas characters are a
 * villager in a costume. No skeleton: a part is a few voxels and one angle. Front = +z for everyone (the
 * animals' generators face +x and are turned here).
 */
import type { LifeKind } from "@vila/shared/game/life";
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { bird, cat, dog, owl, rabbit, reindeer } from "./animals";
import { type Costume, villagerRig } from "./characters";
import { V } from "./palette";
import { box, rotate } from "./parts";
import { Rng, type Seed } from "./rng";

export interface RigPart {
  voxels: Voxel[];
  /** Height and depth (voxels) of the axis the part turns about: an axis across the body. */
  pivot: readonly [y: number, z: number];
  /** How much of each of the three angles of the character this part takes: the walk, and two gestures. */
  swing: number;
  first: number;
  second: number;
  /** Something held: drawn only while the character's activity shows it. */
  prop?: boolean;
}

export interface Rig {
  size: number;
  parts: RigPart[];
  /** Tiny animals skip the shadow pass, like the tiny decor did: their shadow is sub-pixel at gameplay distance. */
  shadow: boolean;
  /** Height of the model (u): the box a click on the character is tested against. */
  height: number;
}

const body = (voxels: Voxel[]): RigPart => ({ voxels, pivot: [0, 0], swing: 0, first: 0, second: 0 });

const COSTUME: Partial<Record<LifeKind, Costume>> = {
  santa: { skin: P.skin, hair: P.cream, coat: P.red, pants: P.red, boots: P.coal, legs: 2, torso: 4, wide: true, buttons: null, hem: false, mitt: P.cream, scarf: null, hat: "none" },
  elf: { coat: P.pineLight, pants: P.pine, boots: P.red, legs: 2, torso: 3, wide: false, buttons: P.gold, hem: true, mitt: P.red, scarf: null, hat: "none" },
  lumberjack: { hair: P.trunk, coat: V.redDeep, pants: V.blueNight, boots: V.woodDark, legs: 3, torso: 4, wide: true, buttons: null, hem: false, mitt: P.wood, scarf: null, hat: "beanie", hatColor: P.coal },
};

/** What each costume adds to the villager it is built on. Returns the voxels of what it holds, if anything. */
function dress(kind: LifeKind, seed: Seed, rig: ReturnType<typeof villagerRig>): Voxel[] {
  const v = rig.voxels, r = new Rng(seed, "cast");
  const { hip: y0, shoulder, wide: w, head: hy } = rig;
  const y1 = shoulder - 1, top = hy + 3;
  const held: Voxel[] = [];
  if (kind === "santa") {
    // White fur trim, black belt with a gold buckle, the beard, and the hat with its pompom.
    box(v, -w, w, y0, y0, 1, 1, P.cream);
    box(v, -w, w, y0 + 1, y0 + 1, 1, 1, P.coal);
    v.push([0, y0 + 1, 1, P.gold]);
    for (let y = y0 + 2; y <= y1; y++) v.push([0, y, 1, P.cream]);
    box(v, -1, 1, hy, hy, 2, 2, P.cream);
    v.push([0, hy - 1, 2, P.cream], [-1, hy + 1, 2, P.cream], [1, hy + 1, 2, P.cream]);
    box(v, -2, 2, top, top, -2, 2, P.cream);
    box(v, -1, 1, top + 1, top + 1, -1, 1, P.red);
    v.push([0, top + 2, -1, P.red], [0, top + 2, -2, P.red], [0, top + 1, -2, P.cream]);
  } else if (kind === "elf") {
    // Pointed hat with a bell, pointed ears, a red collar, and the gift it carries to the tree.
    const hat = r.pick([P.pine, P.red, P.pineLight]);
    box(v, -1, 1, top, top, -1, 1, hat);
    v.push([0, top + 1, 0, hat], [0, top + 2, 0, hat], [0, top + 3, -1, P.gold]);
    const skin = v.find((p) => p[0] === 0 && p[1] === hy + 1 && p[2] === 0)?.[3] ?? P.skin;
    v.push([-2, hy + 1, 0, skin], [2, hy + 1, 0, skin], [-2, hy + 2, -1, skin], [2, hy + 2, -1, skin]);
    box(v, -w, w, y1, y1, 1, 1, P.red);
    const wrap = r.pick([P.red, P.gold, V.blueNight, P.cream]);
    box(held, -1, 1, y0 + 1, y0 + 2, 2, 3, wrap);
    held.push([0, y0 + 3, 2, P.gold], [0, y0 + 3, 3, P.gold], [0, y0 + 1, 4, P.gold], [0, y0 + 2, 4, P.gold]);
  } else if (kind === "lumberjack") {
    // Checked coat, a beard, and the firewood he carries down the lane.
    for (let y = y0; y <= y1; y++) for (let x = -w; x <= w; x++) if ((x + y) % 2 === 0) v.push([x, y, 0, P.red]);
    box(v, -1, 1, hy, hy, 2, 2, P.trunk);
    v.push([0, hy - 1, 2, P.trunk]);
    for (let x = -2; x <= 2; x++) held.push([x, y0 + 1, 2, x % 2 ? P.trunk : P.wood], [x, y0 + 2, 2, x % 2 ? P.wood : P.trunk]);
  } else if (kind === "shopkeeper") {
    // An apron over the coat, and the broom for the doorstep.
    box(v, -1, 1, y0, y1 - 1, 1, 1, P.cream);
    v.push([0, y1, 1, P.cream]);
    for (let y = 1; y <= y1 - 1; y++) held.push([w + 1, y, 2, P.wood]);
    box(held, w, w + 2, 0, 0, 2, 3, P.gold);
  } else if (kind === "visitor") {
    // A backpack: someone who is passing through.
    box(v, -1, 1, y0 + 1, y1, -2, -2, r.pick([P.red, V.blueNight, P.leaf, P.gold]));
    v.push([0, y1, -3, P.cream]);
  }
  return held;
}

function person(kind: LifeKind, seed: Seed): Rig {
  const rig = villagerRig(seed, COSTUME[kind]);
  const held = dress(kind, seed, rig);
  const of = (name: string) => rig.voxels.filter((v) => (rig.part.get(v) ?? "body") === name);
  // The lumberjack's axe is part of his right arm: it comes down with the arm when he chops.
  const armR = of("armR");
  if (kind === "lumberjack") {
    const x = rig.wide + 1, y = rig.shoulder - 4;
    armR.push([x, y, 1, P.wood], [x, y, 2, P.wood], [x, y, 3, P.stoneDark], [x, y + 1, 3, P.stoneDark], [x, y - 1, 3, P.stoneDark]);
  }
  const limb = (voxels: Voxel[], pivotY: number, swing: number, first: number, second: number): RigPart => ({ voxels, pivot: [pivotY, 0], swing, first, second });
  const size = kind === "elf" ? 0.24 : kind === "santa" ? 0.32 : 0.3;
  const parts = [
    body(of("body")),
    limb(of("legL"), rig.hip, 1, 0, 0),
    limb(of("legR"), rig.hip, -1, 0, 0),
    // Arms swing against the legs; the first gesture is the right arm's, the second the left arm's.
    limb(of("armL"), rig.shoulder, -0.8, 0, 1),
    limb(armR, rig.shoulder, 0.8, 1, 0),
  ];
  if (held.length) parts.push({ ...body(held), prop: true });
  return { size, parts, shadow: true, height: (rig.head + 5) * size };
}

/** A four-legged animal: legs in pairs, a head that nods and a tail that wags. `body` = rows of the trunk. */
function quadruped(model: { voxels: Voxel[]; size: number }, trunk: number): Rig {
  const v = model.voxels;
  // The generators face +x: the trunk starts at the first row that has a voxel on the animal's axis.
  const legH = Math.min(...v.filter((p) => p[0] === 0).map((p) => p[1]));
  const len = Math.max(...v.filter((p) => p[1] === 0).map((p) => p[0])) + 1;
  const top = legH + trunk;
  const is = {
    front: (p: Voxel) => p[1] < legH && p[0] > 0,
    back: (p: Voxel) => p[1] < legH && p[0] < 0,
    head: (p: Voxel) => p[1] >= top && p[0] >= len,
    tail: (p: Voxel) => p[1] >= legH && p[0] <= -len - 1,
  };
  const rest = v.filter((p) => !is.front(p) && !is.back(p) && !is.head(p) && !is.tail(p));
  const turn = (voxels: Voxel[]) => rotate(voxels, 1);
  const part = (voxels: Voxel[], y: number, z: number, swing: number, first: number, second: number): RigPart => ({ voxels: turn(voxels), pivot: [y, z], swing, first, second });
  return {
    size: model.size,
    parts: [
      body(turn(rest)),
      part(v.filter(is.front), legH, len - 1, 1, 0, 0),
      part(v.filter(is.back), legH, -(len - 1), -1, 0, 0),
      // The first gesture nods the head (down to graze, up to look), the second wags the tail.
      part(v.filter(is.head), top, len - 0.5, 0, 1, 0),
      part(v.filter(is.tail), top, -len - 0.5, 0, 0, 1),
    ].filter((p) => p.voxels.length > 0),
    shadow: model.size >= 0.2,
    height: (Math.max(...v.map((p) => p[1])) + 1) * model.size,
  };
}

const small = (model: { voxels: Voxel[]; size: number }): Rig => ({
  size: model.size,
  parts: [body(rotate(model.voxels, 1))],
  shadow: false,
  height: (Math.max(...model.voxels.map((p) => p[1])) + 1) * model.size,
});

/** The rig of one character of the cast: its kind and its seed decide everything. */
export function castRig(kind: LifeKind, seed: Seed): Rig {
  switch (kind) {
    case "reindeer":
      return quadruped(reindeer(seed), 3);
    case "dog":
      return quadruped(dog(seed), 2);
    case "cat":
      return quadruped(cat(seed), 2);
    case "bird":
      return small(bird(seed));
    case "rabbit":
      return small(rabbit(seed));
    case "owl":
      return small(owl(seed));
    default:
      return person(kind, seed);
  }
}
