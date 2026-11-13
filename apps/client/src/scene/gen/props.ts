/**
 * Props and items (IMPL-0010, budget: props). Each generator is a recipe of parts + palette choices
 * driven by a seeded Rng; output is integer voxels with the base on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { AWNINGS, BULB_COLORS, PAINTS, RIBBONS, V, WRAPS } from "./palette";
import { box, dedupe, ground, snowCap } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const done = (v: Voxel[]) => dedupe(ground(v));

/** Gift: wrapped box (stripes, dots or checks), ribbon cross and a bow. */
export function gift(seed: Seed): GenModel {
  const r = new Rng(seed, "gift");
  const [base, pat] = r.pick(WRAPS);
  const ribbon = r.pick(RIBBONS.filter((c) => c !== base && c !== pat));
  const w = r.int(1, 2), h = r.int(2, 4), d = r.int(1, 2);
  const style = r.pick(["stripes", "dots", "checks", "plain"] as const);
  const paper = (x: number, y: number, z: number) => {
    if (x === 0 || z === 0) return ribbon;
    if (style === "stripes") return y % 2 ? pat : base;
    if (style === "dots") return (x + y + z) % 3 === 0 ? pat : base;
    if (style === "checks") return (x + y + z) & 1 ? pat : base;
    return base;
  };
  const v: Voxel[] = [];
  box(v, -w, w, 0, h, -d, d, paper);
  // Bow: two loops and a knot on top.
  const bow = r.pick(["loops", "tall", "flat"] as const);
  v.push([0, h + 1, 0, ribbon]);
  if (bow === "loops") v.push([-1, h + 1, 0, ribbon], [1, h + 1, 0, ribbon], [-1, h + 2, 0, ribbon], [1, h + 2, 0, ribbon]);
  else if (bow === "tall") v.push([0, h + 2, 0, ribbon], [0, h + 3, 0, ribbon], [-1, h + 3, 0, ribbon], [1, h + 3, 0, ribbon]);
  else v.push([-1, h + 1, -1, ribbon], [1, h + 1, 1, ribbon], [1, h + 1, -1, ribbon], [-1, h + 1, 1, ribbon]);
  return { voxels: done(v), size: 0.2 };
}

/** Standing lantern: base, frame, glowing core (lights role), roof and optional finial. */
export function lantern(seed: Seed): GenModel {
  const r = new Rng(seed, "lantern");
  const frame = r.pick([P.coal, P.pine, P.red, V.woodDark]);
  const glow = r.pick([P.gold, V.goldDeep]);
  const post = r.int(0, 6);
  const wide = r.chance(0.5);
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, -1, 1, frame);
  for (let y = 1; y <= post; y++) v.push([0, y, 0, frame]);
  const y0 = post + 1, h = r.int(2, 3), s = wide ? 1 : 0;
  box(v, -s, s, y0, y0 + h - 1, -s, s, glow);
  const c = s + 1; // frame corner bars just outside the glowing core
  for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c]]) box(v, x, x, y0, y0 + h - 1, z, z, frame);
  const top = y0 + h;
  const rr = s + 1;
  box(v, -rr, rr, top, top, -rr, rr, frame);
  if (r.chance(0.7)) box(v, -rr + 1, rr - 1, top + 1, top + 1, -rr + 1, rr - 1, frame);
  if (r.chance(0.5)) v.push([0, top + 2, 0, P.gold]);
  // Snow only on the roof cap, not on the frame bars.
  const out = snowCap(v, P.snow, (x, z) => Math.abs(x) <= s && Math.abs(z) <= s);
  return { voxels: done(out), size: 0.22, emissive: [glow] };
}

/** Fence segment: posts and rails or pickets, painted, snow on the post tops. Runs along X. */
export function fence(seed: Seed): GenModel {
  const r = new Rng(seed, "fence");
  const paint = r.pick(PAINTS);
  const len = r.int(6, 10), h = r.int(3, 4), gap = r.int(2, 3);
  const style = r.pick(["rails", "pickets", "cross"] as const);
  const v: Voxel[] = [];
  for (let x = 0; x <= len; x += gap) box(v, x, x, 0, h, 0, 0, paint);
  if (style === "rails") for (const y of [1, h - 1]) box(v, 0, len, y, y, 0, 0, paint);
  else if (style === "pickets") {
    box(v, 0, len, 1, 1, 0, 0, paint);
    for (let x = 0; x <= len; x++) box(v, x, x, 0, h - 1 + ((x & 1) ^ 1), 0, 0, paint);
  } else {
    box(v, 0, len, h - 1, h - 1, 0, 0, paint);
    for (let x = 0; x < len; x++) v.push([x, 1 + (x % gap), 0, paint]);
  }
  const out = snowCap(v, P.snow, (x) => x % gap === 0 || r.chance(0.4));
  return { voxels: done(out.map(([x, y, z, c]) => [x - Math.floor(len / 2), y, z, c])), size: 0.25 };
}

/** Sled: runners with a curled front, slatted seat, optional backrest and cargo. Faces +x. */
export function sled(seed: Seed): GenModel {
  const r = new Rng(seed, "sled");
  const runner = r.pick([P.gold, P.coal, P.red]);
  const seat = r.pick(PAINTS);
  const len = r.int(5, 8), half = r.int(1, 2);
  const v: Voxel[] = [];
  for (const z of [-half, half]) {
    box(v, 0, len, 0, 0, z, z, runner);
    v.push([len + 1, 1, z, runner], [len + 1, 2, z, runner], [len, 3, z, runner]);
    for (let x = 1; x < len; x += 3) v.push([x, 1, z, runner]);
  }
  box(v, 0, len - 1, 2, 2, -half, half, (x) => (x % 2 ? seat : V.woodDark));
  if (r.chance(0.5)) box(v, 0, 0, 3, 4, -half, half, seat);
  if (r.chance(0.5)) {
    const [wrap, pat] = r.pick(WRAPS);
    box(v, 2, 3, 3, 4, -1, 0, (_x, y) => (y === 4 ? pat : wrap));
  }
  return { voxels: done(v.map(([x, y, z, c]) => [x - Math.floor(len / 2), y, z, c])), size: 0.22 };
}

/** Mailbox: post, rounded box, flag up or down, snow cap. No text or brand. */
export function mailbox(seed: Seed): GenModel {
  const r = new Rng(seed, "mailbox");
  const body = r.pick([P.red, P.pine, V.blueNight, P.cream, V.woodLight]);
  const post = r.pick([P.wood, V.woodDark, P.coal]);
  const height = r.int(3, 5), len = r.int(2, 3);
  const v: Voxel[] = [];
  box(v, 0, 0, 0, height, 0, 0, post);
  box(v, -1, 1, height + 1, height + 2, -len, len, body);
  box(v, 0, 0, height + 3, height + 3, -len, len, body);
  const flagUp = r.chance(0.5);
  v.push([2, height + 2, -len + 1, P.coal]);
  if (flagUp) v.push([2, height + 3, -len + 1, P.red], [2, height + 4, -len + 1, P.red], [2, height + 4, -len + 2, P.red]);
  else v.push([2, height + 2, -len + 2, P.red]);
  if (r.chance(0.4)) v.push([0, height + 1, len + 1, P.gold]); // door knob
  return { voxels: done(snowCap(v, P.snow, (x) => x === 0)), size: 0.2 };
}

/** Signpost: post with one to three blank boards pointing different ways (no text, IMPL-0010). */
export function signpost(seed: Seed): GenModel {
  const r = new Rng(seed, "signpost");
  const post = r.pick([P.wood, V.woodDark]);
  const height = r.int(6, 9), boards = r.int(1, 3);
  const v: Voxel[] = [];
  box(v, 0, 0, 0, height, 0, 0, post);
  for (let i = 0; i < boards; i++) {
    const y = height - 1 - i * 2;
    const board = r.pick(PAINTS);
    const len = r.int(2, 4);
    const dir = r.pick([1, -1]);
    const alongZ = r.chance(0.4);
    for (let k = 1; k <= len; k++) {
      const a = dir * k;
      v.push(alongZ ? [0, y, a, board] : [a, y, 0, board]);
    }
    const tip = dir * (len + 1);
    v.push(alongZ ? [0, y, tip, board] : [tip, y, 0, board]); // arrow tip
  }
  v.push([0, height + 1, 0, P.snow]);
  return { voxels: done(v), size: 0.22 };
}

/** Garland swag: sagging pine rope with bulbs (lights role) and bows at the ends. Runs along X. */
export function garland(seed: Seed): GenModel {
  const r = new Rng(seed, "garland");
  const len = r.int(8, 14), sag = r.int(1, 3), every = r.int(2, 3);
  const bulbs = r.chance(0.5) ? BULB_COLORS : [r.pick(BULB_COLORS)];
  const bow = r.pick([P.red, P.gold, V.redBright]);
  const v: Voxel[] = [];
  for (let x = 0; x <= len; x++) {
    const t = x / len;
    const y = sag + 1 - Math.round(Math.sin(Math.PI * t) * sag);
    v.push([x, y, 0, (x + y) % 3 ? P.pineLight : P.pineDark]);
    v.push([x, y + 1, 0, P.pineDark]);
    if (x > 0 && x < len && x % every === 0) v.push([x, y - 1, 0, bulbs[(x / every) % bulbs.length]]);
  }
  for (const x of [0, len]) {
    const y = sag + 1;
    v.push([x, y + 2, 0, bow], [x - 1, y + 2, 0, bow], [x + 1, y + 2, 0, bow], [x, y + 3, 0, bow]);
  }
  return { voxels: done(v.map(([x, y, z, c]) => [x - Math.floor(len / 2), y, z, c])), size: 0.22, emissive: [...bulbs] };
}

/** Market stall: counter, two posts, striped sloped awning with snow, goods on the counter. */
function stall(seed: Seed, goods: "mixed" | "panetone"): GenModel {
  const r = new Rng(seed, `stall-${goods}`);
  const [a, b] = r.pick(AWNINGS);
  const wood = r.pick([P.wood, V.woodLight, V.woodDark]);
  const half = r.int(2, 3), depth = 1;
  const v: Voxel[] = [];
  box(v, -half, half, 0, 1, -depth, depth, (_x, y) => (y === 1 ? V.creamShade : wood)); // counter
  for (const x of [-half, half]) box(v, x, x, 2, 5, -depth, -depth, wood); // posts (back)
  // Awning slopes down toward the front (+z).
  for (let z = -depth - 1; z <= depth + 1; z++) {
    const y = 6 - Math.max(0, z + depth);
    for (let x = -half - 1; x <= half + 1; x++) v.push([x, y, z, Math.floor((x + 64) / 2) % 2 ? a : b]); // 2-wide stripes
  }
  if (goods === "panetone") {
    for (let x = -half + 1; x <= half - 1; x += 2) v.push([x, 2, 0, P.gold], [x, 3, 0, V.crust]);
  } else {
    for (let x = -half + 1; x <= half - 1; x++) {
      const kind = r.int(0, 3);
      if (kind === 0) v.push([x, 2, 0, r.pick(WRAPS)[0]]);
      else if (kind === 1) v.push([x, 2, 0, P.red], [x, 3, 0, P.pineLight]); // little pot plant
      else if (kind === 2) v.push([x, 2, 0, P.carrot]);
    }
  }
  // A strip of snow along the high back edge of the awning; the stripes stay readable.
  const out = snowCap(v, P.snow, (_x, z) => z === -depth - 1);
  return { voxels: done(out), size: 0.42 }; // people-sized: the counter reaches the avatar's waist
}

/** Log pile (the wood yard, IMPL-0024): two rows of three logs and one on top, cut ends lighter, snow on the top log. Runs along X. */
export function logPile(seed: Seed): GenModel {
  const r = new Rng(seed, "log-pile");
  const barks = [P.trunk, P.wood, V.woodDark] as const;
  const v: Voxel[] = [];
  const log = (y: number, z: number) => {
    const bark = r.pick(barks);
    const cut = r.pick([V.woodLight, V.furLight]);
    box(v, -3, 3, y, y, z, z, (x) => (Math.abs(x) === 3 ? cut : bark));
  };
  for (const y of [0, 1]) for (const z of [-1, 0, 1]) log(y, z);
  log(2, 0);
  const snowy = r.int(0, 2);
  const out = snowCap(v, P.snow, (x, z) => z === 0 && (x + snowy) % 3 !== 0);
  return { voxels: done(out), size: 0.5 };
}

export const marketStall = (seed: Seed) => stall(seed, "mixed");
/** Panettone stand: a Brazilian Christmas staple, warm dome loaves on the counter. */
export const panettoneStand = (seed: Seed) => stall(seed, "panetone");

export const PROPS: Generator[] = [
  { id: "gift", category: "props", name: "Presente", generate: gift },
  { id: "lantern", category: "props", name: "Lanterna", generate: lantern },
  { id: "fence", category: "props", name: "Cerca", generate: fence },
  { id: "sled", category: "props", name: "Trenó", generate: sled },
  { id: "mailbox", category: "props", name: "Caixa de correio", generate: mailbox },
  { id: "signpost", category: "props", name: "Placa", generate: signpost },
  { id: "garland", category: "props", name: "Guirlanda", generate: garland },
  { id: "market-stall", category: "props", name: "Barraca", generate: marketStall },
  { id: "panettone-stand", category: "props", name: "Barraca de panetone", generate: panettoneStand },
  { id: "log-pile", category: "props", name: "Pilha de lenha", generate: logPile },
];
