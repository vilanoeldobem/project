/**
 * Civic buildings of the village (IMPL-0031, PROPOSTA; budget: civic): a bank, a canteen, a gym, a school, a
 * cinema, a theatre, a market, a hospital, a sleigh station, a gallery and a sports hall. Scenery: nothing is
 * sold or served in any of them, and none carries text, a logo or a brand. Front = +z, door in the middle of
 * the front wall. Windows use the `glow` role, lamps and marquee bulbs the `emissive` role.
 *
 * Every building is a solid block (only its outside is meshed) whose walls are where `CIVIC` in the shared
 * world says they are: the colliders live there, and `colliders.test.ts` checks them against these voxels. The
 * seed (the id of the building's site) picks colours only, never the shape.
 */
import { CIVIC, type CivicKind, PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../models";
import { AWNINGS, course, V } from "./palette";
import { box, dedupe } from "./parts";
import { Rng, type Seed } from "./rng";
import type { GenModel, Generator } from "./types";

type Paint = (x: number, y: number, z: number) => string;

interface Facade {
  hw: number;
  hd: number;
  /** Highest wall course (the walls span y = 0 … top). */
  top: number;
  wall: string;
  trim: string;
  door: string;
  /** Height of a floor: windows fill its two middle courses. */
  floor?: number;
  /** Half width of the door. */
  doorHalf?: number;
  /** The front is glass between piers, from knee to lintel. */
  glass?: boolean;
  /** Lay the wall in alternating courses. */
  courses?: boolean;
}

/** Colour of a wall voxel: stone base, door, windows by floor, trim on the top course. */
function facade(f: Facade): Paint {
  const floor = f.floor ?? f.top + 1, doorHalf = f.doorHalf ?? 0;
  return (x, y, z) => {
    const front = z === f.hd, back = z === -f.hd, side = Math.abs(x) === f.hw;
    if (!front && !back && !side) return f.wall; // inside: never seen
    const corner = side && (front || back);
    if (front && Math.abs(x) <= doorHalf && y <= 2) return y === 2 && doorHalf > 0 ? P.window : f.door;
    if (y === 0) return (x + z) % 2 === 0 ? P.stoneDark : P.stone;
    if (y === f.top) return f.trim;
    const level = y % floor;
    const lit = level === 1 || level === 2;
    if (!corner && lit) {
      if (front && f.glass && Math.abs(x) % 3 !== 0) return P.window;
      if (front && !f.glass && Math.abs(x) > doorHalf + 1 && Math.abs(x) % 2 === 0) return P.window;
      if (side && z % 2 === 0) return P.window;
      if (back && x % 3 === 0 && level === 2) return P.window;
    }
    if (corner) return f.trim;
    return f.courses && y % 2 === 0 ? course(f.wall) : f.wall;
  };
}

/** A flat roof with a parapet, one course above the walls. */
function flatRoof(v: Voxel[], hw: number, hd: number, y: number, roof: string, parapet: string) {
  box(v, -hw - 1, hw + 1, y, y, -hd - 1, hd + 1, (x, _y, z) => (Math.abs(x) === hw + 1 || Math.abs(z) === hd + 1 ? parapet : roof));
}

/**
 * What stands on a flat roof, which is most of what the camera sees of a hall: a skylight along the middle
 * (lit at night with the windows), a planter at one end and a ventilation box at the other. `clear` keeps the
 * middle of the roof free where the legs of a screen stand.
 */
function roofTop(v: Voxel[], hw: number, hd: number, y: number, clear = false) {
  if (hw >= 6 && !clear) for (let x = -hw + 3; x <= hw - 3; x++) if (x % 4 !== 0) v.push([x, y, 0, P.window]);
  if (clear) for (const end of [-1, 1]) for (let x = 5; x <= hw - 3; x++) if (x % 3 !== 0) v.push([end * x, y, 0, P.window]);
  box(v, -hw + 1, -hw + 2, y, y, -hd + 1, -hd + 1, P.stoneDark);
  for (const x of [hw - 2, hw - 1]) v.push([x, y, hd - 1, V.pineMoss], [x, y, -hd + 1, V.pineMoss]);
}

/** A striped awning over the front, above every head. */
function awning(v: Voxel[], hw: number, hd: number, y: number, [a, b]: readonly [string, string]) {
  for (let x = -hw; x <= hw; x++) v.push([x, y, hd + 1, Math.floor((x + 64) / 2) % 2 ? a : b]);
}

/** Columns of a portico in front of the wall, on a step as long as the front and under a beam. */
function portico(v: Voxel[], hw: number, hd: number, top: number, columns: readonly number[], colour: string, beam: string) {
  box(v, -hw, hw, 0, 0, hd + 1, hd + 1, P.stone);
  for (const x of columns) for (let y = 1; y < top; y++) v.push([x, y, hd + 1, colour]);
  box(v, -hw, hw, top, top, hd + 1, hd + 1, beam);
}

/** A pediment: a triangle over the front, one voxel thick. */
function pediment(v: Voxel[], hw: number, z: number, y: number, colour: string, accent: string) {
  for (let k = 0; hw - 2 * k >= 0; k++) for (let x = -(hw - 2 * k); x <= hw - 2 * k; x++) v.push([x, y + k, z, k > 0 && x === 0 ? accent : colour]);
}

const done = (v: Voxel[], emissive: string[] = []): GenModel => ({ voxels: dedupe(v), size: 1, glow: [P.window], emissive });

function bank(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.bank;
  const wall = r.pick([V.stoneWarm, P.cream, V.creamShade, P.stone]), accent = r.pick([P.gold, V.goldDeep, P.pine]), door = r.pick([V.woodDark, P.pine, V.navy]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 4, -hd, hd, facade({ hw, hd, top: 4, wall, trim: V.slate, door, doorHalf: 0, floor: 5 }));
  portico(v, hw, hd, 5, [-4, -2, 2, 4], P.cream, V.slate);
  flatRoof(v, hw, hd, 5, V.slate, wall);
  pediment(v, hw, hd + 1, 6, wall, accent);
  // A lantern at each side of the door.
  v.push([-1, 3, hd + 1, P.gold], [1, 3, hd + 1, P.gold]);
  return done(v, [P.gold]);
}

function restaurant(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.restaurant;
  const wall = r.pick([P.cream, P.terracotta, V.mustard, V.woodLight]), stripes = r.pick(AWNINGS), roof = r.pick([P.terracotta, V.redDeep, V.slate]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 3, -hd, hd, facade({ hw, hd, top: 3, wall, trim: V.woodDark, door: stripes[0], glass: true, courses: true }));
  awning(v, hw, hd, 3, stripes);
  // A low hipped roof and a chimney at the back: something is always on the fire.
  for (let k = 0; k < 2; k++) box(v, -hw - 1 + k, hw + 1 - k, 4 + k, 4 + k, -hd - 1 + k, hd + 1 - k, roof);
  box(v, hw - 1, hw - 1, 4, 7, -hd + 1, -hd + 1, V.slate);
  return done(v);
}

function gym(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.gym;
  const wall = r.pick([V.skyBlue, V.navy, P.pine, V.slate]), band = r.pick([P.gold, P.cream, V.redBright]), door = r.pick([P.coal, V.woodDark]);
  const v: Voxel[] = [];
  const paint = facade({ hw, hd, top: 3, wall, trim: band, door, glass: true });
  box(v, -hw, hw, 0, 3, -hd, hd, paint);
  flatRoof(v, hw, hd, 4, band, wall);
  roofTop(v, hw, hd, 5);
  // A band of colour above the door.
  for (let x = -2; x <= 2; x++) v.push([x, 3, hd + 1, band]);
  return done(v);
}

function school(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.school;
  const wall = r.pick([V.mustard, P.cream, P.terracotta, V.woodLight]), roof = r.pick([P.terracotta, V.redDeep, V.pineMoss]), door = r.pick([P.red, P.pine, V.navy]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 3, -hd, hd, facade({ hw, hd, top: 3, wall, trim: P.cream, door, doorHalf: 0 }));
  // A gable roof along the street, and the bell tower over the door.
  for (let k = 0; k <= hd + 1; k++) box(v, -hw - 1, hw + 1, 4 + k, 4 + k, -(hd + 1 - k), hd + 1 - k, roof);
  box(v, -1, 1, 4, 7, hd - 1, hd + 1, (x, y, z) => (y === 6 && (x === 0 || z === hd) ? P.coal : y === 7 ? P.cream : wall));
  v.push([0, 6, hd, P.gold]);
  for (let k = 0; k < 2; k++) box(v, -1 + k, 1 - k, 8 + k, 8 + k, hd - 1 + k, hd + 1 - k, roof);
  return done(v, [P.gold]);
}

function cinema(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.cinema;
  const wall = r.pick([V.navy, V.redDeep, V.slate, P.pine]), accent = r.pick([P.gold, V.redBright, P.cream]), door = r.pick([P.gold, P.red]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 5, -hd, hd, (x, y, z) => {
    const front = z === hd, edge = Math.abs(x) === hw || Math.abs(z) === hd;
    if (!edge) return wall;
    if (front && Math.abs(x) <= 1 && y <= 2) return y === 2 ? P.window : door;
    if (y === 0) return P.stoneDark;
    if (y === 5) return accent;
    // Two poster frames on the front, lit from inside.
    if (front && (Math.abs(x) === 3 || Math.abs(x) === 4) && (y === 1 || y === 2)) return P.window;
    return Math.abs(x) % 2 === 0 ? wall : course(wall);
  });
  // The marquee: a slab over the door with a row of bulbs on its edge.
  box(v, -4, 4, 3, 3, hd + 1, hd + 2, (x, _y, z) => (z === hd + 2 ? (x % 2 === 0 ? P.gold : P.bulbRed) : accent));
  flatRoof(v, hw, hd, 6, V.redDeep, accent);
  return done(v, [P.gold, P.bulbRed]);
}

function theatre(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.theatre;
  const wall = r.pick([P.cream, V.creamShade, V.stoneWarm, V.rose]), accent = r.pick([P.red, V.redDeep, P.gold]), door = r.pick([P.red, V.woodDark, P.gold]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 4, -hd, hd, facade({ hw, hd, top: 4, wall, trim: accent, door, doorHalf: 1, floor: 5 }));
  portico(v, hw, hd, 5, [-6, -4, -2, 2, 4, 6], P.cream, accent);
  flatRoof(v, hw, hd, 5, V.slate, wall);
  pediment(v, hw, hd + 1, 6, wall, accent);
  return done(v);
}

function supermarket(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.supermarket;
  const wall = r.pick([P.cream, V.creamShade, P.stone, V.woodLight]), stripes = r.pick(AWNINGS), band = r.pick([P.red, P.pine, V.navy]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 3, -hd, hd, facade({ hw, hd, top: 3, wall, trim: band, door: band, doorHalf: 1, glass: true }));
  awning(v, hw, hd, 3, stripes);
  flatRoof(v, hw, hd, 4, V.creamShade, band);
  roofTop(v, hw, hd, 5);
  return done(v);
}

function hospital(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.hospital;
  const wall = r.pick([P.cream, P.snowShade, V.creamShade, P.stone]), band = r.pick([V.skyBlue, V.navy, V.pineMoss]), door = r.pick([V.skyBlue, P.cream]);
  const v: Voxel[] = [];
  const paint = facade({ hw, hd, top: 5, wall, trim: band, door, doorHalf: 1, floor: 3 });
  // A green cross over the door: the sign of a place of care, not anybody's emblem.
  const cross = (x: number, y: number) => (Math.abs(x) <= 1 && y === 4) || (x === 0 && y >= 3 && y <= 5);
  box(v, -hw, hw, 0, 5, -hd, hd, (x, y, z) => (z === hd && cross(x, y) ? P.pineLight : paint(x, y, z)));
  flatRoof(v, hw, hd, 6, P.stone, band);
  roofTop(v, hw, hd, 7);
  // A canopy over the entrance, above every head.
  box(v, -2, 2, 3, 3, hd + 1, hd + 2, band);
  return done(v);
}

function sleighStation(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC["sleigh-station"];
  const roof = r.pick([P.red, V.redDeep, P.pine, V.navy]), wood = r.pick([P.wood, V.woodLight, V.woodDark]), sled = r.pick([P.red, P.pine, V.navy]);
  const v: Voxel[] = [];
  // The canopy: four posts and a roof with a cream edge. The avatar walks under it.
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) for (let y = 0; y <= 4; y++) v.push([x, y, z, P.trunk]);
  box(v, -hw - 1, hw + 1, 5, 5, -hd - 1, hd + 1, (x, _y, z) => (Math.abs(x) === hw + 1 || Math.abs(z) === hd + 1 ? P.cream : roof));
  box(v, -hw, hw, 6, 6, -hd + 1, hd - 1, roof);
  for (const [x, z] of [[hw, hd], [-hw, hd]]) v.push([x, 3, z + 1, P.gold]);
  // The keeper's cabin at one end.
  box(v, -hw, -hw + 3, 0, 3, -hd, 0, (x, y, z) => {
    if (x === -hw + 3 && z === -1 && y <= 1) return V.woodDark;
    if (y === 2 && z === 0 && x === -hw + 1) return P.window;
    return y === 3 ? V.woodDark : wood;
  });
  // Hay for the reindeer, and a sled parked under the roof.
  box(v, 1, 3, 0, 1, -hd, -hd, (x, y) => (y === 1 && x === 2 ? V.goldDeep : V.mustard));
  box(v, 0, 3, 0, 0, 1, 1, P.gold);
  box(v, 0, 2, 1, 1, 1, 1, sled);
  v.push([0, 2, 1, sled], [3, 1, 1, P.gold]);
  return done(v, [P.gold]);
}

function mall(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC.mall;
  const wall = r.pick([P.cream, V.creamShade, V.stoneWarm, P.stone]), band = r.pick([P.gold, P.red, V.navy]), stripes = r.pick(AWNINGS);
  const v: Voxel[] = [];
  const paint = facade({ hw, hd, top: 7, wall, trim: band, door: P.coal, doorHalf: 2, floor: 4, glass: true });
  // A glass atrium over the doors, the whole height of the front.
  box(v, -hw, hw, 0, 7, -hd, hd, (x, y, z) => (z === hd && Math.abs(x) <= 2 && y >= 3 && y <= 6 ? P.window : paint(x, y, z)));
  // An awning between the two floors on each side of the atrium.
  for (let x = -hw; x <= hw; x++) if (Math.abs(x) > 3) v.push([x, 4, hd + 1, Math.floor((x + 64) / 2) % 2 ? stripes[0] : stripes[1]]);
  flatRoof(v, hw, hd, 8, V.creamShade, band);
  roofTop(v, hw, hd, 9, true);
  return done(v);
}

function sportsHall(r: Rng): GenModel {
  const { halfWidth: hw, halfDepth: hd } = CIVIC["sports-hall"];
  const wall = r.pick([P.cream, V.skyBlue, V.creamShade, P.stone]), roof = r.pick([V.slate, V.navy, V.pineMoss]), band = r.pick([P.pine, P.red, V.navy]);
  const v: Voxel[] = [];
  box(v, -hw, hw, 0, 3, -hd, hd, facade({ hw, hd, top: 3, wall, trim: band, door: band, doorHalf: 1 }));
  // The roof in an arch from front to back, closed at each end by a wall with a round window.
  const rise = [4, 3, 2, 0];
  for (let z = -hd; z <= hd; z++) {
    const peak = 3 + rise[Math.abs(z)];
    box(v, -hw, hw, 4, peak, z, z, (x, y) => (Math.abs(x) === hw ? (z === 0 && y === 5 ? P.window : wall) : y === peak ? roof : wall));
  }
  return done(v);
}

const BUILD: Record<CivicKind, (r: Rng) => GenModel> = {
  bank, restaurant, gym, school, cinema, theatre, supermarket, hospital, "sleigh-station": sleighStation, mall, "sports-hall": sportsHall,
};

/** The model of a civic building. The seed is the id of its site (`civic-03`): the same building for every visitor. */
export function civic(kind: CivicKind, seed: Seed): GenModel {
  return BUILD[kind](new Rng(seed, `civic:${kind}`));
}

export const CIVIC_GENERATORS: Generator[] = (Object.keys(BUILD) as CivicKind[]).map((kind) => ({
  id: `civic-${kind}`,
  category: "civic",
  name: CIVIC[kind].name,
  generate: (seed) => civic(kind, seed),
}));
