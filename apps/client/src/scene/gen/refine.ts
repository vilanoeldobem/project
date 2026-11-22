/**
 * Refinement pass for buildings (IMPL-0035): a coarse model (the massing every rule of the village is written
 * against: footprints, colliders, plot rows, NGO levels) is split into blocks three times smaller, and each part
 * is detailed by what it is, as voxel games do with their buildings:
 *
 * - windows: glass set back one block, a lintel above and a sill below, white frames;
 * - doors (from `roles.doors`): set back, a fanlight of glass on top, a brass knob;
 * - roofs (`roles.roof`): shingles in alternating courses;
 * - stone: bricks in offset courses;
 * - snow: a thin cap with a soft bump now and then, never a whole cube;
 * - icicles: thin hanging columns; a chimney: a wider cap and a dark pot; a wreath: a ring.
 *
 * Three, not two: a coarse block of size s splits into cells centred on the coarse grid (x - 1/3, x, x + 1/3), so
 * the refined model needs no offset, its anchors only scale and its world footprint does not move. Pure and
 * deterministic: a function of the model alone, the same for every visitor.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { CHIMNEY } from "./houses";
import { HIDDEN } from "../mesher";
import { course, V } from "./palette";
import type { GenModel } from "./types";

export const REFINE = 3;
const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const R = REFINE;

/** A small deterministic hash of a cell, for the occasional bump of snow or the length of an icicle. */
const hash = (x: number, y: number, z: number) => {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

/** Colours that are details, never a wall or a roof. */
const DETAILS = new Set<string>([P.window, P.snow, P.ice, P.gold, P.pineLight, CHIMNEY, P.stone, P.stoneDark]);

/**
 * The wall and roof colours of a model that does not name them (shops, civic buildings): the roof is the commonest
 * colour of the top surfaces above the ground floor, the wall the commonest colour of outward faces under something.
 */
function inferRoles(voxels: readonly Voxel[], has: (x: number, y: number, z: number) => boolean): { wall?: string; roof?: string } {
  const tops = new Map<string, number>(), sides = new Map<string, number>();
  const bump = (m: Map<string, number>, c: string) => m.set(c, (m.get(c) ?? 0) + 1);
  for (const [x, y, z, c] of voxels) {
    if (DETAILS.has(c)) continue;
    const open = !has(x + 1, y, z) || !has(x - 1, y, z) || !has(x, y, z + 1) || !has(x, y, z - 1);
    if (!has(x, y + 1, z) && y >= 2) bump(tops, c);
    else if (open && has(x, y + 1, z)) bump(sides, c);
  }
  const most = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
  const roof = most(tops);
  sides.delete(roof ?? "");
  return { roof, wall: most(sides) };
}

export function refineBuilding(model: GenModel): GenModel {
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const cells = new Map<string, Voxel>();
  for (const v of model.voxels) cells.set(k(v[0], v[1], v[2]), v);
  const has = (x: number, y: number, z: number) => cells.has(k(x, y, z));
  const roles = { ...inferRoles(model.voxels, has), ...model.roles };
  const doors = new Set((roles.doors ?? []).map(([x, y, z]) => k(x, y, z)));
  const enclosed = (x: number, y: number, z: number) => SIX.every(([dx, dy, dz]) => has(x + dx, y + dy, z + dz));
  const out: Voxel[] = [];
  const put = (x: number, y: number, z: number, c: string) => out.push([x, y, z, c]);

  for (const v of cells.values()) {
    const [x, y, z, c] = v;
    // Hidden inside the building (the filled interior): nothing of it is ever seen, so it is not split. Only the
    // fine cells that touch a split neighbour are kept, never drawn (`HIDDEN`), so the walls keep hiding their
    // inner faces.
    if (enclosed(x, y, z)) {
      for (const [dx, dy, dz] of SIX) {
        if (!has(x + dx, y + dy, z + dz) || enclosed(x + dx, y + dy, z + dz)) continue;
        for (let i = -1; i <= 1; i++)
          for (let j = 0; j < R; j++)
            for (let kk = -1; kk <= 1; kk++) {
              const onFace = (dx !== 0 && i === dx) || (dz !== 0 && kk === dz) || (dy === 1 && j === R - 1) || (dy === -1 && j === 0);
              if (onFace) put(x * R + i, y * R + j, z * R + kk, HIDDEN);
            }
      }
      continue;
    }
    // The side that faces out: an open horizontal neighbour pointing away from the middle of the building.
    let ox = 0, oz = 0, best = -Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (has(x + dx, y, z + dz)) continue;
      const away = dx * x + dz * z;
      if (away > best) (best = away), (ox = dx), (oz = dz);
    }
    const facing = best > -Infinity;
    const X = x * R, Y = y * R, Z = z * R;
    const above = has(x, y + 1, z);
    for (let j = 0; j < R; j++)
      for (let i = -1; i <= 1; i++)
        for (let kk = -1; kk <= 1; kk++) {
          const depth = facing ? i * ox + kk * oz : 0; // 1 = outer layer, 0 = middle, -1 = inner
          const lateral = facing ? (ox !== 0 ? kk : i) : 0;
          const cx = X + i, cy = Y + j, cz = Z + kk;
          let color: string | null = c;
          if (c === P.window && facing) {
            if (depth === 1) color = j === 2 ? V.frame : j === 0 ? V.frame : null; // lintel, sill, recess
            else if (depth === 0 && lateral === 0 && j === 1) color = V.frame; // the cross bar of the panes
          } else if (doors.has(k(x, y, z)) && facing) {
            if (depth === 1) color = lateral === 1 && j === 1 && y === 0 ? P.gold : null; // knob, recess
            else if (depth === 0 && y > 0 && j === 2) color = P.window; // fanlight
            else if (depth === 0 && j === 0 && y > 0) color = course(c); // the line between the two leaves
          } else if (c === roles.roof) {
            color = y % 2 === 0 ? c : course(c); // shingles: one course per step of the roof
          } else if ((c === P.stone || c === P.stoneDark) && facing && (above || y === 0)) {
            // Bricks on walls and foundations only: a stone roof or cap stays one plain surface.
            color = ((cx + cz + ((Y + j) % 2) * 2) >> 1) % 2 === 0 ? c : course(c);
          } else if (c === P.snow && !above) {
            // A thin cap: the bottom course, and a soft bump on about a third of the cells.
            color = j === 0 || (j === 1 && hash(cx, cy, cz) < 0.3) ? c : null;
          } else if (c === P.ice) {
            const len = 1 + Math.floor(hash(X, Y, Z) * 3);
            color = i === 0 && kk === 0 && j >= R - len ? c : null;
          } else if (c === CHIMNEY && !above) {
            // The pot: a dark hole in the middle of the top course; the cap is added around it below.
            if (j === R - 1 && i === 0 && kk === 0) color = V.soot;
          } else if (c === P.pineLight && facing && !above && !has(x, y - 1, z)) {
            // A wreath hung on a wall: a ring on the outer layer only.
            color = depth === 1 && !(lateral === 0 && j === 1) ? c : null;
          }
          if (color) put(cx, cy, cz, color);
        }
    if (c === CHIMNEY && !above) for (let i = -2; i <= 2; i++) for (let kk = -2; kk <= 2; kk++) if (Math.abs(i) === 2 || Math.abs(kk) === 2) put(X + i, Y + R - 1, Z + kk, P.stoneDark);
  }
  const scale = (a: [number, number, number]): [number, number, number] => [a[0] * R, a[1] * R, a[2] * R];
  return {
    ...model,
    voxels: out,
    size: model.size / R,
    glow: model.glow,
    ao: false,
    anchors: model.anchors ? Object.fromEntries(Object.entries(model.anchors).map(([name, a]) => [name, scale(a)])) : undefined,
    roles: undefined,
  };
}

const drawn = new Map<string, GenModel>();
/** The refined model for a key, made once (a building is the same for the whole session). */
export function refinedOnce(key: string, coarse: () => GenModel): GenModel {
  let m = drawn.get(key);
  if (!m) drawn.set(key, (m = refineBuilding(coarse())));
  return m;
}
