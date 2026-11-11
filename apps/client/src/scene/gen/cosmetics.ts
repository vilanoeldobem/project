/**
 * Avatar cosmetic layers (IMPL-0010, budget: cosmetics per layer) — catalogue and unlocks are PROPOSTA and
 * live in `@vila/shared/game/cosmetics`. Each layer is a small voxel model with its base on y = 0 and an
 * `attach` anchor in avatar body coordinates (size 0.3: torso y 3–5, head y 6–8, hat from y 9). Layers
 * paint over the base body (last voxel wins), so they always fit `avatarParts()`.
 *
 * Catalogue items use explicit parameters (`ITEMS`); the seeded generators only exist to explore variety
 * in the gallery.
 */
import type { Look } from "@vila/shared/game/cosmetics";
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { V } from "./palette";
import { box, dedupe } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

type HatStyle = "santa" | "beanie" | "earmuffs" | "holly" | "top";
type Pattern = "snowflake" | "stripes" | "zigzag" | "dots";

const KNITS = [P.red, P.gold, P.cream, P.pineLight, V.redBright, P.bulbBlue, V.blueNight] as const;

export function hatLayer(style: HatStyle, color: string, accent: string): GenModel {
  const v: Voxel[] = [];
  let attach: [number, number, number] = [0, 9, 0];
  if (style === "santa") {
    box(v, -1, 1, 0, 0, -1, 1, accent);
    box(v, -1, 0, 1, 1, -1, 0, color);
    v.push([0, 2, 0, accent]);
  } else if (style === "beanie") {
    box(v, -1, 1, 0, 0, -1, 1, color);
    box(v, -1, 1, 0, 0, 1, 1, accent); // folded band at the front
    v.push([0, 1, 0, accent]); // pompom
  } else if (style === "earmuffs") {
    attach = [0, 7, 0]; // muffs sit at ear height
    for (const x of [-2, 2]) v.push([x, 0, 0, color], [x, 1, 0, color]);
    box(v, -1, 1, 2, 2, 0, 0, accent); // band over the head
    v.push([-2, 2, 0, accent], [2, 2, 0, accent]);
  } else if (style === "holly") {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x !== 0 || z !== 0) v.push([x, 0, z, (x + z) & 1 ? P.pineLight : P.pineDark]);
    v.push([0, 1, 1, accent], [1, 1, 1, accent], [0, 1, 0, P.pineLight]); // berries
  } else {
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) + Math.abs(z) < 4) v.push([x, 0, z, color]);
    box(v, -1, 1, 1, 2, -1, 1, color);
    box(v, -1, 1, 1, 1, -1, 1, accent);
  }
  return { voxels: dedupe(v), size: 0.3, anchors: { attach } };
}

export function scarfLayer(a: string, b: string, tail: number): GenModel {
  const v: Voxel[] = [];
  // Ring around the bottom of the head (local y = 2 → avatar y = 6), striped every other voxel.
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.max(Math.abs(x), Math.abs(z)) === 2) v.push([x, 2, z, (x + z) & 1 ? a : b]);
  for (let i = 0; i < tail; i++) v.push([1, 1 - i, 2, i & 1 ? b : a]);
  return { voxels: ground(v), size: 0.3, anchors: { attach: [0, 6 - (2 - lowest(v)), 0] } };
}

export function sweaterLayer(base: string, accent: string, pattern: Pattern): GenModel {
  const v: Voxel[] = [];
  // The torso front (x −1..1, y 0..2 → avatar y 3..5, z 0) plus a collar row.
  box(v, -1, 1, 0, 2, 0, 0, (x, y) => {
    if (pattern === "snowflake") return (x === 0) !== (y === 1) ? base : accent;
    if (pattern === "stripes") return y === 1 ? accent : base;
    if (pattern === "zigzag") return (x + y) % 2 === 0 ? accent : base;
    return x === 0 && y === 1 ? accent : base;
  });
  box(v, -1, 1, 3, 3, 0, 0, accent);
  return { voxels: dedupe(v), size: 0.3, anchors: { attach: [0, 3, 0] } };
}

const lowest = (v: Voxel[]) => Math.min(...v.map((p) => p[1]));
const ground = (v: Voxel[]) => {
  const lo = lowest(v);
  return dedupe(v.map(([x, y, z, c]) => [x, y - lo, z, c]));
};

/** Outfit colour palettes (coat, sleeves, trousers, belt trim). */
export const PALETTES: Record<string, { coat: string; pants: string; trim: string }> = {
  "palette-classic": { coat: P.red, pants: "#2E3A4A", trim: P.cream },
  "palette-forest": { coat: P.pine, pants: P.trunk, trim: P.gold },
  "palette-night": { coat: V.blueNight, pants: P.coal, trim: P.snow },
};

/** Catalogue items (ids from the shared PROPOSTA catalogue) → layers with fixed parameters. */
export const ITEMS: Record<string, () => GenModel | null> = {
  "hat-santa": () => hatLayer("santa", P.red, P.cream),
  "hat-beanie": () => hatLayer("beanie", P.gold, P.red),
  "hat-earmuffs": () => hatLayer("earmuffs", P.red, V.creamShade),
  "hat-holly": () => hatLayer("holly", P.pineDark, P.red),
  "scarf-none": () => null,
  "scarf-stripes": () => scarfLayer(P.red, P.cream, 3),
  "scarf-pine": () => scarfLayer(P.pineLight, P.pineDark, 2),
  "sweater-none": () => null,
  "sweater-snowflake": () => sweaterLayer(V.blueNight, P.snow, "snowflake"),
  "sweater-stripes": () => sweaterLayer(P.red, P.cream, "stripes"),
};

/** Paints a layer onto voxels at its attach point. */
export function applyLayer(body: Voxel[], layer: GenModel | null): Voxel[] {
  if (!layer) return body;
  const [ax, ay, az] = layer.anchors?.attach ?? [0, 0, 0];
  return dedupe([...body, ...layer.voxels.map(([x, y, z, c]): Voxel => [x + ax, y + ay, z + az, c])]);
}

/* ---------------------------------------------------- seeded, for the gallery */

const hatGen = (seed: Seed) => {
  const r = new Rng(seed, "hat");
  return hatLayer(r.pick(["santa", "beanie", "earmuffs", "holly", "top"] as const), r.pick(KNITS), r.pick(KNITS));
};
const scarfGen = (seed: Seed) => {
  const r = new Rng(seed, "scarf");
  return scarfLayer(r.pick(KNITS), r.pick(KNITS), r.int(1, 3));
};
const sweaterGen = (seed: Seed) => {
  const r = new Rng(seed, "sweater");
  return sweaterLayer(r.pick(KNITS), r.pick(KNITS), r.pick(["snowflake", "stripes", "zigzag", "dots"] as const));
};

export const COSMETIC_LAYERS: Generator[] = [
  { id: "hat", category: "cosmetics", name: "Chapéu (camada)", generate: hatGen },
  { id: "scarf", category: "cosmetics", name: "Cachecol (camada)", generate: scarfGen },
  { id: "sweater", category: "cosmetics", name: "Suéter (camada)", generate: sweaterGen },
];

export type { Look };
