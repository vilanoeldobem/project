/**
 * Animals (IMPL-0010, budget: animals): reindeer, dogs, cats, birds, rabbits and owls in the reindeer's
 * blocky style. Idle motion (breathing, slow look-around) is done by the `idle` material in the vertex
 * shader, keyed on each voxel's centre, so models stay static data. Owls are night animals: `nightOnly`
 * tells the scene to show them only after dusk (real São Paulo time). Front = +x.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { V } from "./palette";
import { box, dedupe } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const FUR = [P.wood, V.woodDark, V.furLight, V.furGrey, P.cream, P.coal, V.ginger] as const;

/** Four legs, body block, head at the front: the shared quadruped recipe. */
function quadruped(v: Voxel[], o: { len: number; legH: number; bodyH: number; half: number; fur: string; belly?: string }) {
  const { len, legH, bodyH, half, fur, belly } = o;
  for (const x of [-len + 1, len - 1]) for (const z of [-half, half]) box(v, x, x, 0, legH - 1, z, z, fur);
  box(v, -len, len, legH, legH + bodyH - 1, -half, half, fur);
  if (belly) box(v, -len + 1, len - 1, legH, legH, -half, half, belly);
  return legH + bodyH; // top of the body
}

export function reindeer(seed: Seed): GenModel {
  const r = new Rng(seed, "reindeer");
  const fur = r.pick([P.wood, V.woodDark, V.furLight]), light = r.pick([V.creamShade, V.furLight, P.cream]);
  const v: Voxel[] = [];
  const top = quadruped(v, { len: 3, legH: 4, bodyH: 3, half: 1, fur, belly: light });
  box(v, 3, 4, top, top + 2, 0, 0, fur); // neck
  box(v, 4, 6, top + 2, top + 3, -1, 1, fur); // head
  v.push([7, top + 2, 0, r.chance(0.2) ? P.bulbRed : P.coal]); // nose (a rare red one)
  v.push([5, top + 3, -1, P.coal], [5, top + 3, 1, P.coal]);
  const antler = r.int(2, 4);
  for (const z of [-1, 1]) {
    for (let y = 1; y <= antler; y++) v.push([4, top + 3 + y, z, V.creamShade]);
    v.push([3, top + 3 + antler, z * 2, V.creamShade], [5, top + 3 + antler, z * 2, V.creamShade]);
  }
  v.push([-4, top - 1, 0, light]); // tail
  if (r.chance(0.6)) {
    const harness = r.pick([P.red, P.pine, P.gold]);
    box(v, -1, 1, top, top, -1, 1, harness);
    v.push([0, top, 2, P.gold]);
  }
  return { voxels: dedupe(v), size: 0.35, idle: true };
}

export function dog(seed: Seed): GenModel {
  const r = new Rng(seed, "dog");
  const fur = r.pick(FUR), spot = r.pick(FUR.filter((c) => c !== fur));
  const len = r.int(2, 3), legH = r.int(2, 3);
  const v: Voxel[] = [];
  const top = quadruped(v, { len, legH, bodyH: 2, half: 1, fur });
  if (r.chance(0.5)) v.push([0, top - 1, 1, spot], [-1, top - 1, -1, spot], [1, top - 1, 1, spot]);
  box(v, len, len + 2, top, top + 1, -1, 1, fur); // head
  v.push([len + 3, top, 0, P.coal]); // nose
  v.push([len + 2, top + 1, -1, P.coal], [len + 2, top + 1, 1, P.coal]);
  const ears = r.pick(["up", "down"] as const);
  for (const z of [-1, 1]) v.push(ears === "up" ? [len, top + 2, z, fur] : [len, top, z * 2, spot]);
  v.push([-len - 1, top, 0, fur], [-len - 1, top + 1, 0, fur]); // tail up
  if (r.chance(0.4)) box(v, len - 1, len - 1, top - 1, top, -1, 1, r.pick([P.red, P.pineLight, P.gold])); // collar/scarf
  return { voxels: dedupe(v), size: 0.22, idle: true };
}

export function cat(seed: Seed): GenModel {
  const r = new Rng(seed, "cat");
  const fur = r.pick(FUR), stripe = r.pick(FUR.filter((c) => c !== fur));
  const v: Voxel[] = [];
  const top = quadruped(v, { len: 2, legH: 2, bodyH: 2, half: 1, fur });
  if (r.chance(0.6)) for (let x = -2; x <= 2; x += 2) box(v, x, x, top - 1, top - 1, -1, 1, stripe);
  box(v, 2, 3, top, top + 1, -1, 1, fur); // head
  v.push([2, top + 2, -1, fur], [2, top + 2, 1, fur]); // pointy ears
  v.push([4, top + 1, -1, P.bulbGreen], [4, top + 1, 1, P.bulbGreen]); // eyes
  const curl = r.pick([2, 3, 4]);
  for (let y = 0; y < curl; y++) v.push([-3, top + y, 0, fur]);
  v.push([-2, top + curl, 0, fur]);
  return { voxels: dedupe(v), size: 0.18, idle: true };
}

export function bird(seed: Seed): GenModel {
  const r = new Rng(seed, "bird");
  const [body, breast] = r.pick([
    [V.woodDark, P.carrot], // robin-like
    [P.red, V.redDeep], // cardinal-like
    [V.blueNight, P.cream],
    [P.cream, P.coal],
    [V.furGrey, P.cream],
    [P.pine, P.gold],
  ] as const);
  const v: Voxel[] = [];
  v.push([0, 0, -1, P.carrot], [0, 0, 1, P.carrot]); // feet
  box(v, -1, 1, 1, 2, -1, 1, body);
  box(v, 1, 1, 1, 2, -1, 1, breast);
  box(v, 0, 1, 3, 3, -1, 1, body); // head
  v.push([2, 3, 0, P.gold]); // beak
  v.push([1, 3, -1, P.coal], [1, 3, 1, P.coal]);
  const tail = r.int(1, 2);
  for (let i = 1; i <= tail; i++) v.push([-1 - i, 2 + (i > 1 ? 1 : 0), 0, body]);
  if (r.chance(0.3)) v.push([0, 4, 0, body]); // crest
  return { voxels: dedupe(v), size: 0.12, idle: true };
}

export function rabbit(seed: Seed): GenModel {
  const r = new Rng(seed, "rabbit");
  const fur = r.pick([P.snow, P.cream, V.furLight, P.wood, V.furGrey]);
  const v: Voxel[] = [];
  box(v, -2, 1, 0, 2, -1, 1, fur); // crouched body
  box(v, 1, 3, 2, 3, -1, 1, fur); // head
  v.push([3, 3, -1, P.coal], [3, 3, 1, P.coal], [4, 2, 0, P.bulbRed]);
  const ear = r.int(2, 4), flop = r.chance(0.3);
  for (const z of [-1, 1]) for (let y = 1; y <= ear; y++) v.push(flop && y > 1 ? [2 - y, 4, z * 2, fur] : [1, 3 + y, z, fur]);
  v.push([-3, 1, 0, P.snow], [-3, 2, 0, P.snow]); // cotton tail
  return { voxels: dedupe(v), size: 0.14, idle: true };
}

/** Owl (night only): perched, big eyes that glow softly (lights role). */
export function owl(seed: Seed): GenModel {
  const r = new Rng(seed, "owl");
  const snowy = r.chance(0.35);
  const body = snowy ? P.snow : r.pick([P.wood, V.woodDark, V.furGrey]);
  const face = snowy ? V.creamShade : r.pick([V.furLight, P.cream]);
  const eye = r.pick([P.gold, V.goldDeep]);
  const v: Voxel[] = [];
  v.push([0, 0, -1, P.gold], [0, 0, 1, P.gold]); // talons
  box(v, -1, 1, 1, 4, -1, 1, body);
  box(v, 1, 1, 2, 3, -1, 1, face);
  box(v, -1, 1, 5, 6, -1, 1, body); // head
  box(v, 1, 1, 5, 6, -1, 1, face);
  v.push([1, 6, -1, eye], [1, 6, 1, eye], [1, 5, 0, P.gold]); // eyes, beak
  if (r.chance(0.6)) v.push([0, 7, -1, body], [0, 7, 1, body]); // ear tufts
  if (snowy) for (const [y, z] of [[2, -1], [3, 1], [4, 0]] as const) v.push([1, y, z, P.coal]); // speckles
  return { voxels: dedupe(v), size: 0.14, emissive: [eye], idle: true };
}

export const NIGHT_ONLY = new Set(["owl"]);

export const ANIMALS: Generator[] = [
  { id: "reindeer", category: "animals", name: "Rena", generate: reindeer },
  { id: "dog", category: "animals", name: "Cachorro", generate: dog },
  { id: "cat", category: "animals", name: "Gato", generate: cat },
  { id: "bird", category: "animals", name: "Passarinho", generate: bird },
  { id: "rabbit", category: "animals", name: "Coelho", generate: rabbit },
  { id: "owl", category: "animals", name: "Coruja (noite)", generate: owl },
];
