/**
 * Houses (IMPL-0010, budget: houses). Chalets in the style of the hand-made `house()`: footprint, 1–2
 * floors, gable / hip / A-frame roof, chimney (anchor `chimney` = smoke origin), optional porch, wreath and
 * icicles. Windows use the `glow` role, so they light up with the real São Paulo evening.
 * Front = +z (lots face the plaza along local +z). No text, logos or branding: NGO lots get a neutral
 * house seeded by the lot id.
 *
 * Snow is an accent (IMPL-0030, PROPOSTA): it lies along the ridge, so the colour of the roof is what the
 * camera sees from above. The residential rows also draw an archetype per plot, so a
 * street is not one chalet repeated.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { course, V } from "./palette";
import { box, dedupe, snowCap } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

const WALLS = [P.wood, V.woodLight, V.woodDark, P.cream, P.red, P.pine, P.leaf, V.mustard, V.skyBlue, V.rose] as const;
const ROOFS = [P.terracotta, V.redDeep, P.pine, V.slate, V.woodDark, V.navy, V.pineMoss] as const;
const DOORS = [P.gold, P.red, P.pine, V.woodDark] as const;
/** Slate, not the palette's pale stone: from above a pale chimney read as a pillar of snow (IMPL-0030). */
export const CHIMNEY = V.slate;
const FLOOR_H = 3;

/**
 * Shape of a residential house, inside the footprint of its tier (IMPL-0030):
 *
 * - `classic`: the chalet as it always was;
 * - `dormer`: the same gable with a lit dormer over the door;
 * - `townhouse`: two floors under a low hipped roof;
 * - `terrace`: a flat roof with a parapet, planters and a small roof room.
 *
 * Every one keeps the walls where the tier puts them (rows line up, colliders are the tier's) and stays at
 * most 9 voxels tall (a row never hides the street behind it from the camera).
 */
export const ARCHETYPES = ["classic", "dormer", "townhouse", "terrace"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** How a wall is laid: one tone, dark posts, or alternating courses. */
const WALL_PATTERNS = ["plain", "plain", "timber", "plank", "brick"] as const;

/**
 * Fixes part of a chalet instead of drawing it from the seed (IMPL-0024): the residential tiers give every
 * chalet of a row the same footprint, so the rows line up, and keep them low, so a row never hides the
 * street behind it from the camera. Without options the shape is the seed's (NGO lots).
 */
export interface HouseOptions {
  /** Half extents of the walls in voxels. */
  halfWidth?: number;
  halfDepth?: number;
  /** One floor and no A-frame roof. */
  low?: boolean;
  /** How many floors, whatever the seed and `low` say (the levels of an NGO's building, IMPL-0032). */
  floors?: 1 | 2 | 3;
  /** Chance of a porch (0 = never, 1 = always). */
  porch?: number;
  /** false = the roof ends at the side walls (cottages standing close together). */
  eaves?: boolean;
  /**
   * The ridge of a gable roof runs along the street (the chalet's x axis) instead of from front to back. The
   * roof then rises from a low eave over the door to a ridge at mid-depth, so the gable no longer stands as a
   * wall, a whole roof tall, between the camera and whoever walks on the street in front of the chalet.
   */
  ridgeAlongStreet?: boolean;
  /** Shape of the house (default `classic`). */
  archetype?: Archetype;
}

export function house(seed: Seed, options: HouseOptions = {}): GenModel {
  const r = new Rng(seed, "house");
  // Every value is drawn from the seed first, then overridden: the options never shift the other choices.
  const drawnX = r.int(2, 3), drawnZ = r.int(2, 3);
  const hx = options.halfWidth ?? drawnX, hz = options.halfDepth ?? drawnZ;
  const tall = r.chance(0.35);
  const archetype = options.archetype ?? "classic";
  const floors = options.floors ?? (archetype === "townhouse" ? 2 : archetype === "terrace" ? 1 : tall && !options.low ? 2 : 1);
  const wall = r.pick(WALLS);
  const trim = r.pick([P.cream, V.creamShade, V.stoneWarm, V.woodDark].filter((c) => c !== wall));
  const roofColor = r.pick(ROOFS.filter((c) => c !== wall));
  const door = r.pick(DOORS.filter((c) => c !== wall));
  const drawnStyle = r.pick(["gable", "hip", "aframe"] as const);
  const style =
    archetype === "terrace" ? "flat" : archetype === "townhouse" ? "hip" : archetype === "dormer" ? "gable" : options.low && drawnStyle === "aframe" ? "gable" : drawnStyle;
  const ridgeAlongStreet = options.ridgeAlongStreet || archetype === "dormer";
  const over = options.eaves === false ? 0 : 1;
  // Details have a stream of their own, so adding one never changes the shape or the colours above.
  const d = new Rng(seed, "house-detail");
  const pattern = d.pick(WALL_PATTERNS);
  const stoneBase = d.chance(0.35);
  const shutters = d.chance(0.45);
  const flowers = d.chance(0.4) ? d.pick([P.red, P.gold, V.rose]) : null;
  const post = wall === V.woodDark ? P.cream : V.woodDark;
  const v: Voxel[] = [];

  /** A plain wall voxel: the material, as the pattern lays it. */
  const wallAt = (x: number, y: number, z: number): string => {
    if (y === 0 && stoneBase) return (x + z) % 2 === 0 ? P.stoneDark : P.stone;
    if (pattern === "timber") return (x + z) % 3 === 0 ? post : wall;
    if (pattern === "plank" || pattern === "brick") return (pattern === "brick" ? y + ((x + z) % 2 === 0 ? 0 : 1) : y) % 2 === 0 ? wall : course(wall);
    return wall;
  };

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
        // Shutters beside the front windows, and a flower bed against the wall under them.
        const shutter = shutters && z === hz && level === 1 && Math.abs(x) === 1 && hx >= 3;
        const bed = flowers !== null && z === hz && y === 0 && Math.abs(x) === 2 && hx >= 3;
        v.push([x, y, z, isDoor ? door : window ? P.window : shutter ? door : bed ? flowers : level === FLOOR_H - 1 ? trim : onEdge ? V.woodDark : wallAt(x, y, z)]);
      }

  // Roof.
  const base = top + 1;
  let peak = base;
  if (style === "flat") {
    // A slab over the walls, a parapet around it, a small roof room at the back and planters at the front.
    box(v, -hx, hx, base, base, -hz, hz, roofColor);
    for (let x = -hx; x <= hx; x++) for (let z = -hz; z <= hz; z++) if (Math.abs(x) === hx || Math.abs(z) === hz) v.push([x, base + 1, z, trim]);
    peak = base + 1;
  } else if (style === "hip") {
    // The townhouse stops its roof after two courses and closes it with a lid, so it stays low.
    const last = archetype === "townhouse" ? 1 : Infinity;
    for (let k = 0; ; k++) {
      const ex = hx + over - k, ez = hz + 1 - k;
      if (ex < 0 || ez < 0) break;
      const lid = k === last;
      for (let x = -ex; x <= ex; x++) for (let z = -ez; z <= ez; z++) if (lid || Math.abs(x) === ex || Math.abs(z) === ez || ex === 0 || ez === 0) v.push([x, base + k, z, roofColor]);
      peak = base + k;
      if (lid) break;
    }
  } else if (ridgeAlongStreet) {
    // The same gable, turned a quarter: slopes fall to the front and to the back, gable ends on the side walls.
    const span = hz + 1;
    for (let k = 0; k <= span; k++) {
      const z = span - k;
      const y = base + k;
      for (let x = -hx - over; x <= hx + over; x++) for (const sz of z === 0 ? [0] : [-z, z]) v.push([x, y, sz, roofColor]);
      peak = Math.max(peak, y);
      if (k > 0) for (const x of [-hx, hx]) for (let gz = -z + 1; gz <= z - 1; gz++) v.push([x, base + k - 1, gz, gz === 0 && k === Math.ceil(span / 2) ? P.window : wall]);
    }
    if (archetype === "dormer") {
      // A box dormer on the front slope, over the door: a lit window under a small roof of its own.
      for (const x of [-1, 0, 1]) v.push([x, base + 1, hz + 1, x === 0 ? P.window : wall]);
      for (let x = -2; x <= 2; x++) for (const z of [hz, hz + 1]) v.push([x, base + 2, z, roofColor]);
    }
  } else {
    const steep = style === "aframe" ? 2 : 1;
    const span = hx + over;
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
  if (style === "flat") {
    // The roof room stands in the back corner the chimney leaves free; a planter in each front corner.
    const side = -Math.sign(cx);
    const x0 = Math.min(side * (hx - 1), side * Math.max(0, hx - 2)), x1 = Math.max(side * (hx - 1), side * Math.max(0, hx - 2));
    const z0 = -(hz - 1), z1 = Math.min(0, -(hz - 2));
    box(v, x0, x1, base + 1, base + 2, z0, z1, (x, y, z) => (y === base + 1 && z === z1 && x === (side > 0 ? x0 : x1) ? P.window : wallAt(x, 1, z)));
    box(v, x0, x1, base + 3, base + 3, z0, z1, roofColor);
    peak = base + 3;
    for (const x of [-(hx - 1), hx - 1]) v.push([x, base + 1, hz - 1, P.pineLight], [x, base + 2, hz - 1, flowers ?? P.red]);
  }
  const chimneyTop = peak + 1;
  for (let y = base; y <= chimneyTop; y++) v.push([cx, y, cz, CHIMNEY]);

  // What blocks the avatar: the walls and, when there is one, the porch slab (voxel n spans n ± 0.5).
  const solid: GenModel["solid"] = [[-hx - 0.5, hx + 0.5, -hz - 0.5, hz + 0.5]];

  // Porch: slab, two posts, a small roof.
  const porch = r.float();
  if (porch < (options.porch ?? 0.55)) {
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
  if (r.chance(0.5) && over && style !== "flat") for (let z = -hz; z <= hz; z += 2) v.push([-hx - 1, top, z, P.ice], [hx + 1, top, z, P.ice]);

  // Snow along the ridge only, with a gap now and then: a line the eye reads as "snow on the roof", where single
  // cubes scattered over the slopes read as noise. The townhouse has a lid for a ridge, so its snow is the
  // middle course of the lid. Never on the chimney, whose top is where the smoke starts.
  const onRidge = (z: number, y: number) => y >= peak && (archetype !== "townhouse" || z === 0);
  const snowy = snowCap(dedupe(v), P.snow, (x, z, y) => !(x === cx && z === cz) && onRidge(z, y) && (((x + z) % 4) + 4) % 4 !== 1);
  return { voxels: dedupe(snowy), size: 1, glow: [P.window], anchors: { chimney: [cx, chimneyTop + 0.5, cz] }, solid };
}

export const HOUSES: Generator[] = [
  { id: "house", category: "houses", name: "Chalé", generate: house },
  { id: "house-dormer", category: "houses", name: "Casa com água-furtada", generate: (seed) => house(seed, { low: true, ridgeAlongStreet: true, archetype: "dormer" }) },
  { id: "house-townhouse", category: "houses", name: "Sobrado", generate: (seed) => house(seed, { low: true, ridgeAlongStreet: true, archetype: "townhouse" }) },
  { id: "house-terrace", category: "houses", name: "Casa com terraço", generate: (seed) => house(seed, { low: true, ridgeAlongStreet: true, archetype: "terrace" }) },
];
