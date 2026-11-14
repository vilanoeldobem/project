/**
 * Avatar cosmetic models (IMPL-0010, P08/IMPL-0027) — the ten categories of the shared catalogue. Each item
 * is either a small voxel layer with an `attach` anchor in avatar body coordinates or a paint of the base
 * torso/limbs. Sizes follow the avatar grid: torso y 3–5, head y 6–8, hat from y 9, hands at arm y −3, legs at
 * hip y −3…−1. The budget is 40 voxels / 140 faces per item (`gen.test.ts`/`cosmetics.test.ts`).
 *
 * The seeded `hatGen`/`scarfGen`/`sweaterGen` below exist only to explore variety in the development gallery;
 * the catalogue uses the explicit functions. Colours are `PALETTE` entries or named `V` variations only.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { V } from "./palette";
import { box, dedupe, walls } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

export type Pattern = "snowflake" | "stripes" | "zigzag" | "dots";

const KNITS = [P.red, P.gold, P.cream, P.pineLight, V.redBright, P.bulbBlue, V.blueNight] as const;

export function hatLayer(style: "santa" | "beanie" | "earmuffs" | "holly" | "top", color: string, accent: string): GenModel {
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

/** Paints a layer onto voxels at its attach point. */
export function applyLayer(body: Voxel[], layer: GenModel | null): Voxel[] {
  if (!layer) return body;
  const [ax, ay, az] = layer.anchors?.attach ?? [0, 0, 0];
  return dedupe([...body, ...layer.voxels.map(([x, y, z, c]): Voxel => [x + ax, y + ay, z + az, c])]);
}

const lowest = (v: Voxel[]) => Math.min(...v.map((p) => p[1]));
const ground = (v: Voxel[]) => {
  const lo = lowest(v);
  return dedupe(v.map(([x, y, z, c]) => [x, y - lo, z, c]));
};

/* --------------------------------------------------------------- ten-category catalogue */

type BlousePattern = "plain" | "stripes" | "snowflake" | "dots" | "fairisle" | "vest" | "patch";

const BLOUSES: Record<string, { base: string; accent: string; pattern: BlousePattern }> = {
  "blouse-plain": { base: P.red, accent: P.cream, pattern: "plain" },
  "blouse-stripes": { base: P.gold, accent: P.cream, pattern: "stripes" },
  "blouse-snowflake": { base: V.blueNight, accent: P.snow, pattern: "snowflake" },
  "blouse-pine": { base: P.pine, accent: P.gold, pattern: "plain" },
  "blouse-fairisle": { base: P.red, accent: P.cream, pattern: "fairisle" },
  "blouse-dots": { base: P.cream, accent: P.red, pattern: "dots" },
  "blouse-night": { base: V.blueNight, accent: P.gold, pattern: "plain" },
  "blouse-vest": { base: P.cream, accent: P.red, pattern: "vest" },
  "blouse-gold": { base: P.gold, accent: P.cream, pattern: "plain" },
  "blouse-patch": { base: P.red, accent: P.cream, pattern: "patch" },
};

/** Torso front voxels (local y 0–2 at avatar y 3–5) and the sleeve/cuff colours for both arms. */
export function blouseBase(id: string): { torso: Voxel[]; sleeve: string; cuff: string } {
  const spec = BLOUSES[id] ?? BLOUSES["blouse-plain"];
  const { base, accent, pattern } = spec;
  const torso: Voxel[] = [];
  if (pattern === "stripes") {
    box(torso, -1, 1, 0, 0, 0, 0, base);
    box(torso, -1, 1, 1, 1, 0, 0, accent);
    box(torso, -1, 1, 2, 2, 0, 0, base);
  } else if (pattern === "snowflake") {
    box(torso, -1, 1, 0, 2, 0, 0, base);
    for (const [x, y] of [[0, 1], [-1, 0], [1, 0], [-1, 2], [1, 2]] as const) torso.push([x, y, 0, accent]);
  } else if (pattern === "dots") {
    box(torso, -1, 1, 0, 2, 0, 0, base);
    torso.push([0, 1, 0, accent]);
  } else if (pattern === "fairisle") {
    box(torso, -1, 1, 0, 0, 0, 0, accent);
    box(torso, -1, 1, 1, 1, 0, 0, base);
    box(torso, -1, 1, 2, 2, 0, 0, accent);
    torso.push([0, 1, 0, P.gold]);
  } else if (pattern === "vest") {
    box(torso, -1, 1, 0, 2, 0, 0, base);
    for (let y = 0; y <= 2; y++) torso.push([-1, y, 0, accent], [1, y, 0, accent]);
  } else if (pattern === "patch") {
    box(torso, -1, 1, 0, 2, 0, 0, base);
    torso.push([1, 1, 0, accent]);
  } else {
    box(torso, -1, 1, 0, 2, 0, 0, base);
  }
  box(torso, -1, 1, 2, 2, 0, 0, accent);
  return { torso: dedupe(torso), sleeve: base, cuff: accent };
}

type PantsPattern = "solid" | "banded" | "snow" | "patched" | "cuffed" | "leather" | "plaid" | "gold";

const PANTS: Record<string, { base: string; accent: string; pattern: PantsPattern }> = {
  "pants-blue": { base: V.navy, accent: P.cream, pattern: "solid" },
  "pants-charcoal": { base: P.coal, accent: P.stone, pattern: "solid" },
  "pants-brown": { base: P.wood, accent: P.cream, pattern: "solid" },
  "pants-pine": { base: P.pine, accent: P.gold, pattern: "solid" },
  "pants-plaid": { base: P.red, accent: P.coal, pattern: "plaid" },
  "pants-snow": { base: P.snow, accent: P.snowShade, pattern: "snow" },
  "pants-patch": { base: V.navy, accent: P.cream, pattern: "patched" },
  "pants-cuffed": { base: V.navy, accent: P.gold, pattern: "cuffed" },
  "pants-gold": { base: P.gold, accent: P.cream, pattern: "gold" },
  "pants-leather": { base: V.woodDark, accent: P.gold, pattern: "leather" },
};

/** One leg (local y −3…−1) with the trouser colours; the shoes paint over the bottom. */
export function pantsVoxels(id: string): Voxel[] {
  const spec = PANTS[id] ?? PANTS["pants-blue"];
  const { base, accent, pattern } = spec;
  const leg: Voxel[] = [[0, -3, 0, base], [0, -2, 0, base], [0, -1, 0, base]];
  if (pattern === "banded" || pattern === "plaid") {
    leg[1] = [0, -2, 0, accent];
    if (pattern === "plaid") leg[2] = [0, -1, 0, accent];
  } else if (pattern === "snow") {
    leg[0] = [0, -3, 0, P.snow];
    leg[1] = [0, -2, 0, P.snowShade];
    leg[2] = [0, -1, 0, P.snow];
  } else if (pattern === "patched") {
    leg.push([0, -2, 1, accent]);
  } else if (pattern === "cuffed") {
    leg[1] = [0, -2, 0, accent];
  } else if (pattern === "leather") {
    leg[0] = [0, -3, 0, V.woodDark];
    leg[1] = [0, -2, 0, V.woodDark];
    leg[2] = [0, -1, 0, P.gold];
  }
  return dedupe(leg);
}

type ShoePattern = "boot" | "fur" | "clog" | "sneaker" | "skate" | "elf" | "solid";

const SHOES: Record<string, { base: string; accent: string; pattern: ShoePattern }> = {
  "shoes-brown": { base: P.wood, accent: V.creamShade, pattern: "boot" },
  "shoes-black": { base: P.coal, accent: P.stone, pattern: "boot" },
  "shoes-red": { base: P.red, accent: P.cream, pattern: "boot" },
  "shoes-pine": { base: P.pine, accent: P.gold, pattern: "boot" },
  "shoes-snow": { base: P.snow, accent: P.ice, pattern: "fur" },
  "shoes-fur": { base: V.creamShade, accent: P.wood, pattern: "fur" },
  "shoes-clog": { base: P.wood, accent: P.red, pattern: "clog" },
  "shoes-sneaker": { base: P.snow, accent: V.blueNight, pattern: "sneaker" },
  "shoes-skates": { base: P.gold, accent: P.coal, pattern: "skate" },
  "shoes-gold": { base: P.gold, accent: P.cream, pattern: "solid" },
};

/** Paints/extends one leg's bottom (local y −3) into a shoe; the cuff paints the y −2 voxel. */
export function shoesVoxels(id: string, leg: Voxel[]): Voxel[] {
  const spec = SHOES[id] ?? SHOES["shoes-brown"];
  const { base, accent, pattern } = spec;
  const out = leg.map(([x, y, z, c]): Voxel => [x, y, z, y === -3 ? base : y === -2 && (pattern === "boot" || pattern === "fur" || pattern === "sneaker") ? accent : c]);
  if (pattern === "clog") out.push([0, -3, 1, accent]);
  else if (pattern === "elf") out.push([0, -2, 1, accent]);
  else if (pattern === "skate") out.push([0, -3, 1, base], [0, -3, 2, accent]);
  else if (pattern === "boot") out.push([0, -3, 1, base]);
  else out.push([0, -3, 1, pattern === "fur" || pattern === "sneaker" ? accent : P.cream]);
  return dedupe(out);
}

type DressPattern = "plain" | "snow" | "plaid" | "elf" | "stars" | "velvet" | "cream" | "gold";

const DRESSES: Record<string, { base: string; accent: string; pattern: DressPattern }> = {
  "dress-red": { base: P.red, accent: P.cream, pattern: "plain" },
  "dress-pine": { base: P.pine, accent: P.gold, pattern: "plain" },
  "dress-snow": { base: P.snow, accent: P.ice, pattern: "snow" },
  "dress-cream": { base: P.cream, accent: P.red, pattern: "cream" },
  "dress-elf": { base: P.pine, accent: P.red, pattern: "elf" },
  "dress-gold": { base: P.gold, accent: P.cream, pattern: "gold" },
  "dress-plaid": { base: P.red, accent: P.coal, pattern: "plaid" },
  "dress-stars": { base: V.blueNight, accent: P.gold, pattern: "stars" },
  "dress-velvet": { base: V.redDeep, accent: P.cream, pattern: "velvet" },
};

/** The dress in body coordinates: torso y 3–5, skirt y 1–2 around the legs. */
export function dressOverlay(id: string): { torso: Voxel[]; skirt: Voxel[]; sleeve: string } | null {
  if (id === "dress-none") return null;
  const spec = DRESSES[id] ?? DRESSES["dress-red"];
  const { base, accent, pattern } = spec;
  const torso: Voxel[] = [];
  const skirt: Voxel[] = [];
  const torsoColor = (x: number, y: number) => {
    if (pattern === "plaid" || pattern === "elf") return (x + y) % 2 === 0 ? base : accent;
    return base;
  };
  for (let x = -1; x <= 1; x++) for (let y = 3; y <= 5; y++) torso.push([x, y, 0, torsoColor(x, y)]);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
    skirt.push([x, 2, z, (pattern === "elf" && (x + z) % 2 === 0 ? accent : base)]);
    skirt.push([x, 1, z, accent]);
  }
  box(torso, -1, 1, 5, 5, 0, 0, accent); // collar
  if (pattern === "stars") {
    torso.push([0, 4, 0, accent]);
    skirt.push([-1, 2, 0, accent], [1, 2, 0, accent]);
  }
  if (pattern === "cream") box(torso, -1, 1, 3, 3, 0, 0, accent); // sash
  return { torso: dedupe(torso), skirt: dedupe(skirt), sleeve: base };
}

export function helmetLayer(id: string): GenModel | null {
  if (id === "helmet-santa") return hatLayer("santa", P.red, P.cream);
  if (id === "helmet-beanie") return hatLayer("beanie", P.gold, P.red);
  if (id === "helmet-earmuffs") return hatLayer("earmuffs", P.red, V.creamShade);
  if (id === "helmet-holly") return hatLayer("holly", P.pineDark, P.red);
  if (id === "helmet-top") return hatLayer("top", P.coal, P.gold);
  const v: Voxel[] = [];
  if (id === "helmet-antlers") {
    box(v, -1, 1, 0, 0, 0, 0, P.wood);
    for (const x of [-1, 1]) {
      v.push([x, 1, 0, P.wood], [x, 2, 0, P.wood], [x, 2, 1, P.cream], [x, 2, -1, P.cream], [x, 3, 0, P.cream]);
    }
  } else if (id === "helmet-elf") {
    box(v, -1, 1, 0, 0, -1, 1, P.pine);
    box(v, 0, 0, 1, 2, 0, 0, P.pine);
    v.push([1, 3, 0, P.gold]);
  } else if (id === "helmet-hood") {
    walls(v, -1, 1, 0, 0, -1, 1, () => V.blueNight);
    box(v, -1, 1, -3, -1, -1, -1, V.blueNight);
  } else if (id === "helmet-snowman") {
    box(v, -1, 1, 0, 0, -1, 1, P.snow);
    box(v, -1, 0, 1, 2, -1, 0, P.snow);
    box(v, -1, 1, 1, 1, -1, -1, P.coal);
  } else if (id === "helmet-crown") {
    walls(v, -1, 1, 0, 0, -1, 1, () => P.gold);
    v.push([-1, 1, 0, P.gold], [1, 1, 0, P.gold], [0, 1, -1, P.gold], [0, 1, 1, P.gold], [0, 1, 0, P.red]);
  } else return null;
  return { voxels: dedupe(v), size: 0.3, anchors: { attach: [0, 9, 0] } };
}

export function backLayer(id: string): GenModel | null {
  if (id === "back-none") return null;
  const v: Voxel[] = [];
  if (id === "back-wings") {
    box(v, -3, -2, 2, 2, 0, 0, P.snow);
    box(v, 2, 3, 2, 2, 0, 0, P.snow);
    box(v, -3, 3, 3, 3, 0, 0, P.snow);
    box(v, -2, 2, 4, 4, 0, 0, P.ice);
  } else if (id === "back-cape") {
    box(v, -1, 1, 0, 3, 0, 0, P.red);
    v.push([0, 0, 0, P.gold]);
  } else if (id === "back-sack") {
    box(v, -1, 1, 0, 2, 0, 0, P.wood);
    v.push([0, 2, 0, P.gold]);
  } else if (id === "back-backpack") {
    box(v, -1, 1, 0, 2, 0, 0, P.pine);
    box(v, -1, 1, 2, 2, 0, 0, P.gold);
  } else if (id === "back-wreath") {
    walls(v, -1, 1, 0, 2, 0, 0, () => P.pineLight);
    v.push([0, 2, 0, P.red]);
  } else if (id === "back-board") {
    box(v, 0, 0, -1, 4, 0, 0, P.ice);
    v.push([0, 1, 0, P.red], [0, 3, 0, P.red]);
  } else if (id === "back-flag") {
    box(v, 1, 1, -1, 4, 0, 0, P.gold);
    box(v, 0, 1, 3, 4, 0, 0, P.cream);
  } else if (id === "back-tree") {
    box(v, -1, 1, -1, -1, 0, 0, P.pine);
    box(v, -1, 1, 0, 0, 0, 0, P.pineLight);
    box(v, 0, 0, 1, 3, 0, 0, P.pine);
    v.push([0, 4, 0, P.gold]);
  } else if (id === "back-sled") {
    box(v, -2, 2, -1, -1, 0, 0, P.gold);
    box(v, -2, 1, 0, 0, 0, 0, P.red);
  } else return null;
  return { voxels: dedupe(v), size: 0.3, anchors: { attach: [0, 3, -1] } };
}

export function faceLayer(id: string): GenModel | null {
  if (id === "face-none") return null;
  const v: Voxel[] = [];
  if (id === "face-glasses") box(v, -1, 1, 1, 1, 0, 0, P.coal);
  else if (id === "face-freckles") v.push([-1, 1, 0, P.wood], [1, 1, 0, P.wood]);
  else if (id === "face-mustache") box(v, -1, 1, 1, 1, 0, 0, P.wood);
  else if (id === "face-beard") {
    box(v, -1, 1, 0, 0, 0, 0, P.snow);
    v.push([0, -1, 0, P.snow]);
  } else if (id === "face-blush") v.push([-1, 0, 0, V.rose], [1, 0, 0, V.rose]);
  else if (id === "face-scarf") {
    box(v, -1, 1, 0, 0, 0, 0, P.red);
    v.push([0, -1, 0, P.cream]);
  } else if (id === "face-patch") v.push([1, 1, 0, P.coal], [0, 1, 0, P.coal]);
  else if (id === "face-monocle") v.push([1, 1, 0, P.gold], [1, 0, 0, P.gold]);
  else if (id === "face-frost") v.push([0, 2, 0, P.ice], [-1, 1, 0, P.ice], [1, 1, 0, P.ice]);
  else return null;
  return { voxels: dedupe(v), size: 0.3, anchors: { attach: [0, 6, 2] } };
}

const handKind = (id: string) => id.replace(/^hand-(?:left|right)-/, "");

export function handLayer(id: string): GenModel | null {
  const kind = handKind(id);
  if (kind === "none") return null;
  const v: Voxel[] = [];
  if (kind === "candy") v.push([0, 0, 1, P.red], [0, 1, 1, P.cream], [0, 2, 1, P.red]);
  else if (kind === "bell") v.push([0, 0, 1, P.gold]);
  else if (kind === "snowball") v.push([0, 0, 1, P.snow]);
  else if (kind === "mug") v.push([0, 0, 1, P.cream], [0, 1, 1, P.cream], [1, 0, 1, P.wood]);
  else if (kind === "gift") v.push([0, 0, 1, P.red], [0, 1, 1, P.gold]);
  else if (kind === "holly") v.push([0, 0, 1, P.pine], [1, 0, 1, P.red]);
  else if (kind === "broom") v.push([0, 0, 1, P.wood], [0, 1, 1, P.wood], [0, 2, 1, P.wood], [-1, 2, 1, P.gold], [1, 2, 1, P.gold]);
  else if (kind === "lantern") v.push([0, -1, 1, P.gold], [0, 0, 1, P.cream], [0, 1, 1, P.gold]);
  else if (kind === "star") v.push([0, 1, 1, P.gold]);
  else return null;
  return { voxels: dedupe(v), size: 0.3, anchors: { attach: [0, -3, 0] } };
}

export function specialLayer(id: string): GenModel | null {
  if (id === "special-none") return null;
  const v: Voxel[] = [];
  if (id === "special-halo") v.push([0, 10, 0, P.gold], [-1, 10, 0, P.gold], [1, 10, 0, P.gold], [0, 10, -1, P.gold], [0, 10, 1, P.gold]);
  else if (id === "special-snow") v.push([2, 4, 1, P.snow], [-2, 5, 1, P.snow], [2, 6, -1, P.ice], [-2, 7, -1, P.ice], [0, 3, 2, P.snow], [0, 8, -2, P.ice]);
  else if (id === "special-sparkle") v.push([-2, 8, 0, P.gold], [2, 7, 0, P.cream], [0, 9, 1, P.gold], [1, 6, 1, P.cream], [-1, 5, -1, P.gold]);
  else if (id === "special-star") v.push([0, 10, 0, P.gold], [0, 11, 0, P.gold], [-1, 10, 0, P.gold], [1, 10, 0, P.gold]);
  else if (id === "special-fireflies") v.push([2, 3, 1, P.gold], [-2, 4, -1, P.gold], [2, 6, 0, P.gold], [-2, 7, 1, P.gold], [1, 5, 2, P.gold]);
  else if (id === "special-heart") v.push([-1, 11, 0, P.red], [1, 11, 0, P.red], [0, 10, 0, P.red], [0, 11, 0, P.red], [0, 12, 0, P.red]);
  else if (id === "special-frost") v.push([-1, 0, 1, P.ice], [1, 0, 1, P.ice], [-1, 1, -1, P.snow], [1, 1, -1, P.snow], [0, 2, 1, P.ice], [0, 2, -1, P.ice]);
  else if (id === "special-aurora") v.push([-2, 5, -1, P.pineLight], [-1, 6, -1, P.bulbBlue], [0, 7, -1, P.pineLight], [1, 8, -1, P.bulbBlue], [2, 9, -1, P.pineLight], [-1, 8, -1, P.bulbBlue], [1, 6, -1, P.pineLight]);
  else if (id === "special-confetti") v.push([-2, 4, 1, P.red], [2, 5, 1, P.gold], [-2, 6, -1, P.bulbBlue], [2, 7, -1, P.bulbGreen], [0, 8, 1, P.red], [1, 3, -1, P.gold]);
  else return null;
  return { voxels: dedupe(v), size: 0.3, anchors: { attach: [0, 0, 0] } };
}

/** The added voxels of one catalogue item, for the coverage/budget test. `null` only for the `*-none` entries. */
export function itemVoxels(id: string): Voxel[] | null {
  if (id.startsWith("helmet-")) return helmetLayer(id)?.voxels ?? null;
  if (id.startsWith("blouse-")) return blouseBase(id).torso;
  if (id.startsWith("pants-")) return pantsVoxels(id);
  if (id.startsWith("dress-")) {
    const dress = dressOverlay(id);
    return dress ? [...dress.torso, ...dress.skirt] : null;
  }
  if (id.startsWith("shoes-")) return shoesVoxels(id, pantsVoxels("pants-blue"));
  if (id.startsWith("back-")) return backLayer(id)?.voxels ?? null;
  if (id.startsWith("face-")) return faceLayer(id)?.voxels ?? null;
  if (id.startsWith("hand-")) return handLayer(id)?.voxels ?? null;
  if (id.startsWith("special-")) return specialLayer(id)?.voxels ?? null;
  return null;
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
