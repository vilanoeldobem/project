/**
 * Quest items and props for the quests-v1 proposal (IMPL-0010, category: props). Each generator is a pure
 * seeded recipe of parts from `./parts` and colours from `./palette`, with integer voxels grounded on y = 0.
 * Build prompts and visual references: `content/proposals/quests-v1/object-prompts/` and
 * `content/proposals/quests-v1/object-references.md` (PROPOSTA, DEC-039..042 / PEN-025).
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { V } from "./palette";
import { box, dedupe, disc, ground, rotate } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const done = (v: Voxel[]) => dedupe(ground(v));

/**
 * Reindeer harness bell (`reindeer-bell`, PROPOSTA quests-v1 / `harness-bells`), three readable layers:
 * chamfered 5-voxel flared mouth with an acoustic slot and coal clapper, a 3-voxel waist with a gold band,
 * and a rounded dome closed by an open leather strap loop, a collar bow and one snowflake. Bronze/gold tone,
 * mouth width, height and bow style vary by seed; some bells are quarter-turned. Budget: <= 80 voxels and
 * <= 200 faces (measured max 57 / 138), size 0.18, solid only.
 */
export function reindeerBell(seed: Seed): GenModel {
  const r = new Rng(seed, "quest-reindeer-bell");
  const goldSwap = r.chance(0.5);
  const main = goldSwap ? V.goldDeep : P.gold;
  const shine = goldSwap ? P.gold : V.goldDeep;
  const leather = r.pick([P.wood, V.woodDark, V.woodLight]);
  const leatherAlt = leather === V.woodDark ? P.wood : V.woodDark;
  const ribbon = r.pick([P.red, P.pine, V.redDeep]);
  const knot = ribbon === P.pine ? P.red : P.gold;
  const tall = r.chance(0.5);
  const rimBand = r.chance(0.5);
  const bowStyle = r.pick(["tails", "holly", "full"] as const);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  // Clapper hanging below the mouth (y = 0).
  v.push([0, 0, 0, P.coal], [0, 0, 1, V.crust]);

  // Flared mouth (y = 1): 5x5 chamfered lip, so every side flares over 3 voxels without 1-voxel spikes.
  box(v, -1, 1, 1, 1, -1, 1, V.crust);
  const lipColor = rimBand ? shine : main;
  for (let a = -1; a <= 1; a++) {
    v.push([a, 1, 2, a === 0 ? P.coal : lipColor]);
    v.push([a, 1, -2, a === 0 ? V.crust : lipColor]);
    v.push([-2, 1, a, lipColor], [2, 1, a, lipColor]);
  }
  v.push([-1, 1, 2, P.cream], [1, 1, -2, V.crust]);

  // Waist (y = 2 .. waistTop): steps inward to 3x3 with a horizontal band and a vertical highlight.
  const waistTop = tall ? 3 : 2;
  for (let y = 2; y <= waistTop; y++) {
    const isBand = y === 2 && !rimBand;
    box(v, -1, 1, y, y, -1, 1, (x, _y, z) => {
      if (x === -1 && z === 1) return P.cream;
      if (z === -1 && Math.abs(x) === 1) return V.crust;
      return isBand ? shine : main;
    });
  }

  // Rounded crown: 5-voxel cross tapering inward from the waist.
  const domeY = waistTop + 1;
  disc(v, 0, 0, domeY, 1, main);
  v.push([0, domeY, 0, shine], [0, domeY, -1, V.crust]);

  // Open leather strap loop over the crown (the centre of archY stays empty).
  const archY = domeY + 1;
  v.push([-1, archY, 0, leather], [1, archY, 0, leather]);
  v.push([-1, archY + 1, 0, leatherAlt], [0, archY + 1, 0, leatherAlt], [1, archY + 1, 0, leatherAlt]);

  // Collar bow closing the strap, three styles.
  v.push([0, archY, 1, knot], [-1, archY, 1, ribbon], [1, archY, 1, ribbon]);
  if (bowStyle === "tails") {
    v.push([-1, domeY, 1, ribbon], [1, domeY, 1, ribbon]);
  } else if (bowStyle === "holly") {
    v.push([-1, domeY, 1, P.pine], [1, domeY, 1, P.leaf]);
  } else {
    v.push([-1, archY + 1, 1, ribbon], [1, archY + 1, 1, ribbon]);
  }

  // One snowflake settled on the apex of the strap.
  v.push([0, archY + 2, 0, P.snow]);

  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

/**
 * Lucky charm (`lucky-charm`, PROPOSTA quests-v1 / `charm-for-the-flight`): a plump fabric pouch cinched by a
 * double gold cord, with a front star seal, a flared ruffled lip over a dark gathered opening and a pine sprig
 * tucked into the cord. Budget: <= 80 voxels and <= 200 faces (measured max 50 / 108), size 0.18, solid only.
 */
export function luckyCharm(seed: Seed): GenModel {
  const r = new Rng(seed, "quest-lucky-charm");
  const pair = r.pick([
    [P.red, V.redDeep],
    [V.redDeep, P.red],
    [P.cream, V.creamShade],
    [V.blueNight, P.pine],
  ] as const);
  const bag = pair[0];
  const shadeCol = pair[1];
  const goldMain = r.chance(0.5) ? P.gold : V.goldDeep;
  const goldAlt = goldMain === P.gold ? V.goldDeep : P.gold;
  const tall = r.chance(0.5);
  const sprigSide = r.pick([-1, 1] as const);
  const sealStyle = r.pick(["star", "pendant", "crest"] as const);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  // Base (y = 0): 3x3 with shaded corners.
  box(v, -1, 1, 0, 0, -1, 1, (x, _y, z) => (Math.abs(x) === 1 && Math.abs(z) === 1 ? shadeCol : bag));

  // Plump belly with side cheeks, shaded back corners and a golden seal on the front face.
  const bellyTop = tall ? 2 : 1;
  for (let y = 1; y <= bellyTop; y++) {
    box(v, -1, 1, y, y, -1, 1, (x, _y, z) => (z === -1 && Math.abs(x) === 1 ? shadeCol : bag));
    v.push([-2, y, 0, y === 1 ? shadeCol : bag], [2, y, 0, y === 1 ? shadeCol : bag]);
  }
  v.push([0, 1, 2, goldMain], [0, bellyTop, 1, goldAlt]);
  if (sealStyle === "star") {
    v.push([-1, 1, 1, goldAlt], [1, 1, 1, goldAlt]);
  } else if (sealStyle === "pendant") {
    v.push([0, 0, 2, goldAlt]);
  } else {
    v.push([-1, bellyTop, 1, goldMain], [1, bellyTop, 1, goldMain]);
  }

  // Cinched neck (5-voxel cross) bound by the gold cord, with the knot and tassel on the front.
  const neckY = bellyTop + 1;
  disc(v, 0, 0, neckY, 1, goldMain);
  v.push([0, neckY, 1, goldAlt], [-sprigSide, neckY, 1, goldAlt]);

  // Ruffled lip over a dark gathered opening, plus the pine sprig and one snow touch.
  const lipY = neckY + 1;
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, 1]]) {
    v.push([x, lipY, z, (x + z) & 1 ? bag : shadeCol]);
  }
  v.push([0, lipY, 0, V.woodDark]);
  v.push([sprigSide * 2, neckY, 0, P.pine], [sprigSide * 2, lipY, 0, P.leaf], [sprigSide, lipY, -1, P.pine]);
  v.push([0, lipY + 1, -1, P.snow]);

  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

/**
 * Ornament crate (`ornament-crate`, PROPOSTA quests-v1 / `ornament-crates`): an open 5 x (3-4) x (3-4) slatted
 * wooden crate with corner posts, side carry-handle openings, a straw bed and emissive Christmas baubles on
 * top. Budget: <= 80 voxels and <= 200 faces (measured max 68 / 156), size 0.2, solid + emissive baubles.
 */
export function ornamentCrate(seed: Seed): GenModel {
  const r = new Rng(seed, "quest-ornament-crate");
  const wood = r.pick([P.wood, V.woodLight]);
  const dark = V.woodDark;
  const trim = wood === P.wood ? V.woodLight : P.wood;
  const depth = r.pick([1, 2] as const);
  const tall = r.chance(0.5);
  const bulbs = [P.gold, P.bulbRed, P.bulbGreen, P.bulbBlue];
  const rotBulbs = r.int(0, 3);
  const topOrnament = r.pick([0, 1, 2] as const);
  const snowSide = r.pick([-2, 2] as const);
  const turn = r.int(0, 1);

  const zMin = -1;
  const zMax = depth;
  const wallTop = tall ? 3 : 2;

  const v: Voxel[] = [];
  // Planked floor (y = 0) with dark corners, and the straw bed inside (y = 1).
  box(v, -2, 2, 0, 0, zMin, zMax, (x, _y, z) => {
    if (Math.abs(x) === 2 && (z === zMin || z === zMax)) return dark;
    return x % 2 === 0 ? wood : trim;
  });
  box(v, -1, 1, 1, 1, 0, zMax - 1, (x, _y, z) => ((x + z) & 1 ? V.creamShade : P.cream));

  // Corner posts and spaced horizontal slats; the side opening at wallTop - 1 reads as a carry handle.
  for (const x of [-2, 2]) {
    for (const z of [zMin, zMax]) box(v, x, x, 1, wallTop, z, z, dark);
  }
  for (let x = -1; x <= 1; x++) {
    v.push([x, 1, zMin, trim], [x, 1, zMax, trim]);
    v.push([x, wallTop, zMin, wood], [x, wallTop, zMax, wood]);
    if (tall && x === 0) v.push([0, 2, zMin, dark], [0, 2, zMax, dark]);
  }
  for (let z = zMin + 1; z <= zMax - 1; z++) {
    v.push([-2, 1, z, wood], [2, 1, z, wood]);
    if (tall) v.push([-2, wallTop, z, trim], [2, wallTop, z, trim]);
  }

  // Baubles resting on the straw (emissive role), a snow fleck and one seed-picked top ornament.
  const b0 = bulbs[rotBulbs % 4];
  const b1 = bulbs[(rotBulbs + 1) % 4];
  const b2 = bulbs[(rotBulbs + 2) % 4];
  const b3 = bulbs[(rotBulbs + 3) % 4];
  v.push([-1, 2, 0, b0], [1, 2, 0, b1], [0, 2, 0, P.snow]);
  if (zMax === 2) {
    v.push([-1, 2, 1, b2], [1, 2, 1, b3], [0, 2, 1, P.cream]);
  } else {
    v.push([0, 2, 0, b2], [0, 3, 0, b3]);
  }
  if (topOrnament === 0) v.push([0, 3, 0, b0]);
  else if (topOrnament === 1) v.push([-1, 3, 0, b2], [1, 3, zMax - 1, b1]);
  else v.push([0, 3, zMax - 1, b3]);
  v.push([snowSide, wallTop + 1, zMax, P.snow]);

  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.2, emissive: bulbs };
}

/**
 * Global donation reading panel (`donation-panel`, PROPOSTA quests-v1 / `donation-promise-reading`): a wooden
 * lectern on two skids, twin side columns, a slanted reading board with a clean cream surface (no text),
 * a pine/red frame, an optional garland and an emissive lamp on the crest. Budget: <= 220 voxels and
 * <= 600 faces (measured max 77 / 196), size 0.2, solid + emissive lamp.
 */
export function donationPanel(seed: Seed): GenModel {
  const r = new Rng(seed, "quest-donation-panel");
  const post = r.pick([P.wood, V.woodDark]);
  const postAlt = post === P.wood ? V.woodDark : P.wood;
  const frame = r.pick([P.pine, P.red]);
  const frameAccent = frame === P.pine ? P.red : P.pine;
  const lamp = r.pick([P.gold, V.goldDeep]);
  const half = r.int(2, 3);
  const tall = r.chance(0.5);
  const garlandFront = r.chance(0.5);

  const v: Voxel[] = [];
  // Skids (y = 0..1) and the front threshold, so the lectern stands firmly on the snow.
  for (const x of [-half, half]) {
    box(v, x, x, 0, 0, -1, 1, postAlt);
    v.push([x, 1, 0, post]);
  }
  box(v, -half + 1, half - 1, 0, 0, 0, 0, post);

  // Twin columns stop under the board (never above it, or the lectern reads as a bench), a crossbeam
  // and a front apron that carries the optional pine garland with a red centre.
  const baseY = tall ? 3 : 2;
  for (const x of [-half, half]) box(v, x, x, 1, baseY, 0, 0, post);
  box(v, -half + 1, half - 1, baseY - 1, baseY - 1, 0, 0, postAlt);
  for (let x = -half; x <= half; x++) v.push([x, baseY - 1, 1, postAlt]);
  if (garlandFront) {
    for (let x = -half + 1; x <= half - 1; x++) {
      v.push([x, baseY - 1, 1, x === 0 ? frameAccent : P.pineLight]);
    }
  }

  // Slanted board facing +z: three surface rows one step up and one step back, each with a wooden
  // backing so it reads as a thick tilted plank. Only frame and page colours, never text.
  const steps = [
    { y: baseY, z: 1, lip: true },
    { y: baseY + 1, z: 0, lip: false },
    { y: baseY + 2, z: -1, lip: false },
  ] as const;
  for (const { y, z, lip } of steps) {
    for (let x = -half; x <= half; x++) {
      const isEdge = Math.abs(x) === half || lip;
      const pageCol = (x + y) % 2 === 0 ? P.cream : V.creamShade;
      const borderCol = lip && x === 0 ? frameAccent : frame;
      v.push([x, y, z, isEdge ? borderCol : pageCol]);
      v.push([x, y, z - 1, postAlt]);
    }
  }

  // Emissive lamp with a small hood at the crest, and snow along the upper back edge.
  const crestY = baseY + 3;
  for (let x = -half; x <= half; x++) {
    if (x === 0) {
      v.push([0, crestY, -1, lamp], [0, crestY, -2, postAlt]);
    } else if (Math.abs(x) < half || r.chance(0.7)) {
      v.push([x, crestY, -1, P.snow]);
    }
  }

  return { voxels: done(v), size: 0.2, emissive: [lamp] };
}

/**
 * Story page (`story-page`, PROPOSTA quests-v1 / `story-page-delivery`): a thick parchment folio with gilded
 * border, one red ribbon band and a raised wax seal; its short edges curl up in page colours and one end
 * rolls to y = 2, so it reads as a scroll and never as a wrapped box. No characters are drawn. Budget:
 * <= 80 voxels and <= 200 faces (measured max 47 / 130), size 0.18, solid only.
 */
export function storyPage(seed: Seed): GenModel {
  const r = new Rng(seed, "quest-story-page");
  const wide = r.chance(0.5);
  const long = r.chance(0.5);
  const x0 = -2;
  const x1 = wide ? 2 : 1;
  const z0 = -2;
  const z1 = long ? 3 : 2;
  const goldMain = r.chance(0.5) ? P.gold : V.goldDeep;
  const goldAlt = goldMain === P.gold ? V.goldDeep : P.gold;
  const sealMain = r.chance(0.5) ? P.red : V.redDeep;
  const sealAlt = sealMain === P.red ? V.redDeep : P.red;
  const turn = r.int(0, 1);
  // Ribbon band inside the sheet, never on the rim: a cross would read as a wrapped gift.
  const bandZ = z0 + 1 + r.int(0, 1);

  const v: Voxel[] = [];
  // Sheet (y = 0): cream page, gilded border and one red ribbon band.
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const onBorder = x === x0 || x === x1 || z === z0 || z === z1;
      const isCorner = (x === x0 || x === x1) && (z === z0 || z === z1);
      let c = (x + z) & 1 ? V.creamShade : P.cream;
      if (onBorder) c = isCorner ? goldAlt : goldMain;
      if (z === bandZ) c = onBorder ? sealAlt : sealMain;
      v.push([x, 0, z, c]);
    }
  }

  // Curled paper edges in page colours at y = 1 (gold would read as a tray rim), rolled further at
  // one end at y = 2 so the silhouette is a scroll and never a box.
  for (let x = x0; x <= x1; x++) {
    const edgeCol = x & 1 ? V.creamShade : P.cream;
    v.push([x, 1, z0, edgeCol], [x, 1, z1, edgeCol]);
  }
  v.push([x0, 2, z0, V.creamShade], [x1, 2, z0, V.creamShade], [0, 2, z0, P.cream]);

  // Raised wax seal and ribbon knot over the band.
  v.push([0, 1, bandZ, sealMain], [-1, 1, bandZ, sealAlt], [1, 1, bandZ, sealAlt], [0, 2, bandZ, sealAlt]);

  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

export const QUEST_ITEMS: Generator[] = [
  { id: "quest-reindeer-bell", category: "props", name: "Sino do arreio", generate: reindeerBell },
  { id: "quest-lucky-charm", category: "props", name: "Patuá da sorte", generate: luckyCharm },
  { id: "quest-ornament-crate", category: "props", name: "Caixa de enfeites", generate: ornamentCrate },
  { id: "quest-donation-panel", category: "props", name: "Painel de doação global", generate: donationPanel },
  { id: "quest-story-page", category: "props", name: "Página da história", generate: storyPage },
];
