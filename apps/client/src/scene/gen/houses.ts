/**
 * Houses (IMPL-0010, budget: houses). Chalets in the style of the hand-made `house()`: footprint, 1–2
 * floors, gable / hip / A-frame roof with snow, chimney (anchor `chimney` = smoke origin), optional porch,
 * wreath and icicles. Windows use the `glow` role, so they light up with the real São Paulo evening.
 * Front = +z (lots face the plaza along local +z). No text, logos or branding: NGO lots get a neutral
 * house seeded by the lot id.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { V } from "./palette";
import { box, dedupe, snowCap } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const WALLS = [P.wood, V.woodLight, V.woodDark, P.cream, P.red, P.pine] as const;
const ROOFS = [P.terracotta, V.redDeep, P.pine, P.stoneDark, V.woodDark] as const;
const DOORS = [P.gold, P.red, P.pine, V.woodDark] as const;
const FLOOR_H = 3;

export function house(seed: Seed): GenModel {
  const r = new Rng(seed, "house");
  const hx = r.int(2, 3), hz = r.int(2, 3);
  const floors = r.chance(0.35) ? 2 : 1;
  const wall = r.pick(WALLS);
  const trim = r.pick([P.cream, V.creamShade, P.snow, V.woodDark].filter((c) => c !== wall));
  const roofColor = r.pick(ROOFS.filter((c) => c !== wall));
  const door = r.pick(DOORS.filter((c) => c !== wall));
  const style = r.pick(["gable", "hip", "aframe"] as const);
  const v: Voxel[] = [];

  // Walls with windows (glow role) and a door on the front.
  const top = floors * FLOOR_H - 1;
  for (let y = 0; y <= top; y++)
    for (let x = -hx; x <= hx; x++)
      for (let z = -hz; z <= hz; z++) {
        if (Math.abs(x) < hx && Math.abs(z) < hz) continue;
        const level = y % FLOOR_H;
        const isDoor = z === hz && x === 0 && y < 2;
        const onEdge = Math.abs(x) === hx && Math.abs(z) === hz;
        const window =
          !onEdge &&
          level === 1 &&
          (z === hz ? Math.abs(x) === 2 || (y >= FLOOR_H && x === 0) : z === -hz ? x % 2 === 0 : z % 2 === 0);
        v.push([x, y, z, isDoor ? door : window ? P.window : level === FLOOR_H - 1 ? trim : onEdge ? V.woodDark : wall]);
      }

  // Roof.
  const base = top + 1;
  let peak = base;
  if (style === "hip") {
    for (let k = 0; ; k++) {
      const ex = hx + 1 - k, ez = hz + 1 - k;
      if (ex < 0 || ez < 0) break;
      for (let x = -ex; x <= ex; x++) for (let z = -ez; z <= ez; z++) if (Math.abs(x) === ex || Math.abs(z) === ez || ex === 0 || ez === 0) v.push([x, base + k, z, roofColor]);
      peak = base + k;
    }
  } else {
    const steep = style === "aframe" ? 2 : 1;
    const span = hx + 1;
    for (let k = 0; k <= span; k++) {
      const x = span - k;
      for (let s = 0; s < steep; s++) {
        const y = base + k * steep + s;
        for (let z = -hz - 1; z <= hz + 1; z++) for (const sx of x === 0 ? [0] : [-x, x]) v.push([sx, y, z, roofColor]);
        peak = Math.max(peak, y);
      }
      // Gable ends (front/back triangles) in wall colour, with a round window up top.
      if (k > 0) for (const z of [-hz, hz]) for (let gx = -x + 1; gx <= x - 1; gx++) for (let s = 0; s < steep; s++) v.push([gx, base + (k - 1) * steep + s, z, gx === 0 && k === Math.ceil(span / 2) ? P.window : wall]);
    }
  }

  // Chimney through the roof, on one side toward the back.
  const cx = r.pick([-1, 1]) * Math.max(1, hx - 1), cz = -Math.max(1, hz - 1);
  const chimneyTop = peak + 1;
  for (let y = base; y <= chimneyTop; y++) v.push([cx, y, cz, P.stoneDark]);

  // What blocks the avatar: the walls and, when there is one, the porch slab (voxel n spans n ± 0.5).
  const solid: GenModel["solid"] = [[-hx - 0.5, hx + 0.5, -hz - 0.5, hz + 0.5]];

  // Porch: slab, two posts, a small roof.
  if (r.chance(0.55)) {
    // Ends at most 5 voxels from the centre (the street's outer edge when the lot faces the plaza).
    const pw = Math.min(2, hx), depth = hz === 3 ? 1 : 2;
    solid.push([-pw - 0.5, pw + 0.5, hz + 0.5, hz + depth + 0.5]);
    box(v, -pw, pw, 0, 0, hz + 1, hz + depth, V.woodDark);
    for (const x of [-pw, pw]) box(v, x, x, 1, 2, hz + depth, hz + depth, trim);
    box(v, -pw - 1, pw + 1, 3, 3, hz + 1, hz + depth + 1, roofColor);
  }
  // Wreath on the door.
  if (r.chance(0.6)) v.push([-1, 2, hz + 1, P.pineLight], [1, 2, hz + 1, P.pineLight], [0, 2, hz + 1, P.red]);
  // Icicles along the eaves.
  if (r.chance(0.5)) for (let z = -hz; z <= hz; z += 2) v.push([-hx - 1, top, z, P.ice], [hx + 1, top, z, P.ice]);

  const snowy = snowCap(dedupe(v), P.snow, (x, z) => (x * 3 + z * 5) % 4 !== 0 && !(x === cx && z === cz));
  return { voxels: dedupe(snowy), size: 1, glow: [P.window], anchors: { chimney: [cx, chimneyTop + 0.5, cz] }, solid };
}

export const HOUSES: Generator[] = [{ id: "house", category: "houses", name: "Chalé", generate: house }];
