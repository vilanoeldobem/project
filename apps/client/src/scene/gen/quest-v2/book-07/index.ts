/**
 * Book VII props (PROPOSTA): the ice rope, the ice plank, the echo shell and the bridge bell.
 * Seeded recipes only; colours come from PALETTE/V; every model is grounded on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { box, dedupe, disc, ground, rotate, snowCap } from "../../parts";
import { Rng, type Seed } from "../../rng";
import type { GenModel } from "../../types";
import type { StoryPropGenerator } from "../catalog";

const done = (v: Voxel[]) => dedupe(ground(v));

/**
 * `ice-rope`: a coiled ice rope with a loop, a gold thread and a little snow. It is one of the three ropes
 * of the cracked bridge. Budget 80/200.
 */
export function iceRope(seed: Seed): GenModel {
  const r = new Rng(seed, "book-07-ice-rope");
  const rope = r.pick([P.ice, V.skyBlue, P.snow] as const);
  const accent = r.pick([P.gold, P.cream, P.bulbBlue] as const);
  const base = r.pick([P.snowShade, P.stone, P.ice] as const);
  const loops = r.int(2, 3);
  const side = r.int(0, 3);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, base);
  disc(v, 0, 0, 1, 1, rope);
  disc(v, 0, 0, 2, 1, accent);
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 1; i <= loops; i++) {
    const [dx, dz] = dirs[(side + i) % 4];
    v.push([dx * 2, i, dz * 2, rope]);
  }
  v.push([0, 3, 0, accent]);
  if (snow) v.push([-2, 1, 0, P.snow], [2, 1, 0, P.snow]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [accent] };
}

/**
 * `ice-plank`: a pale ice plank with grain, frost edge and a gold nail. It is the loose board and the
 * delivered bridge plank. Budget 80/200.
 */
export function icePlank(seed: Seed): GenModel {
  const r = new Rng(seed, "book-07-ice-plank");
  const panel = r.pick([P.ice, P.snow, V.skyBlue] as const);
  const grain = r.pick([P.snowShade, P.stone, V.stoneWarm] as const);
  const edge = r.pick([P.snow, P.ice, P.stoneDark] as const);
  const nail = r.pick([P.gold, P.cream, V.goldDeep] as const);
  const length = r.int(4, 5);
  const width = r.int(1, 2);
  const deep = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  box(v, -length, length, 0, 0, -width, width, panel);
  for (let x = -length + 1; x <= length - 1; x += 2) v.push([x, 1, 0, grain]);
  v.push([-length, 0, -width, nail], [length, 0, width, nail]);
  if (deep) for (let x = -length + 1; x <= length - 1; x += 3) v.push([x, 0, width, edge]);
  return { voxels: done(rotate(v, turn)), size: 0.16, emissive: [nail] };
}

/**
 * `echo-shell`: a spiral shell with a dark opening and a gold rim. It is the echo shell, the singing stone
 * and the delivered song. Budget 80/200.
 */
export function echoShell(seed: Seed): GenModel {
  const r = new Rng(seed, "book-07-echo-shell");
  const shell = r.pick([V.rose, P.cream, P.ice] as const);
  const inner = r.pick([V.redDeep, P.bulbBlue, P.coal] as const);
  const rim = r.pick([P.gold, P.cream, P.stone] as const);
  const spiralDir = r.int(0, 3);
  const height = r.int(2, 3);
  const open = r.int(0, 3);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, shell);
  const pts: ReadonlyArray<readonly [number, number]> = [[-1, 0], [0, 1], [1, 1], [1, 0], [0, -1], [-1, -1], [-2, 0], [0, 2], [2, 0]];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[(i + spiralDir) % pts.length];
    v.push([x, 1, z, i % 2 === 0 ? shell : rim]);
  }
  for (let y = 2; y <= height; y++) v.push([0, y, 0, rim]);
  const [ox, oz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][open];
  v.push([ox, 1, oz, inner], [ox, 2, oz, inner]);
  if (r.chance(0.5)) v.push([0, height + 1, 0, P.gold]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [rim] };
}

/**
 * `bridge-bell`: a small gold bell between two wooden posts, with a clapper, a crack and snow. It marks the
 * entrance of the bridge and the safe crossing. Budget 220/600.
 */
export function bridgeBell(seed: Seed): GenModel {
  const r = new Rng(seed, "book-07-bridge-bell");
  const wood = r.pick([P.wood, V.woodDark, P.pineDark] as const);
  const metal = r.pick([P.gold, V.goldDeep, P.cream] as const);
  const stone = r.pick([P.stone, P.stoneDark, P.snowShade] as const);
  const half = r.int(2, 3);
  const bodyH = r.int(3, 4);
  const crack = r.int(0, 3);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 3, stone);
  for (const x of [-half - 1, half + 1]) box(v, x, x, 1, 4, 0, 0, wood);
  box(v, -half - 1, half + 1, 5, 5, 0, 0, wood);
  for (let i = 0; i < bodyH; i++) {
    const width = i === 0 ? half : i === 1 ? Math.max(1, half - 1) : 1;
    disc(v, 0, 0, i + 2, width, metal);
  }
  box(v, -1, 1, bodyH + 2, bodyH + 2, 0, 0, metal);
  v.push([0, bodyH + 3, 0, metal], [0, 1, 0, metal]);
  const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][crack];
  for (let i = 1; i < bodyH; i++) {
    const width = i === 1 ? Math.max(1, half - 1) : 1;
    v.push([dx * width, i + 2, dz * width, P.coal]);
  }
  const out = snow ? snowCap(v, P.snow, (x, z, y) => y >= 5 && (x + z) % 2 === 0) : v;
  return { voxels: done(rotate(out, turn)), size: 0.24, emissive: [metal] };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "ice-rope", category: "quest_item", name: "Corda de gelo", generate: iceRope },
  { id: "ice-plank", category: "quest_item", name: "Tábua de gelo", generate: icePlank },
  { id: "echo-shell", category: "quest_item", name: "Concha de eco", generate: echoShell },
  { id: "bridge-bell", category: "world_prop", name: "Sino da ponte", generate: bridgeBell },
];
