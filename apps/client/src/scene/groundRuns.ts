/**
 * The painted ground of the village (pure: no three.js). `groundAt` in the shared world says what is under a
 * point; here that becomes a colour per cell and, row by row, runs of equal colour for `Ground` to draw.
 *
 * The thawed village (IMPL-0030, PROPOSTA): snow is an accent. Roads are the darkest thing on the ground, a
 * light kerb runs along them, the yards are frosted grass with patches of snow, and the open ground turns to
 * snow only towards the edge of the world, where the snowfield and the forest begin.
 */
import { type GroundKind, groundAt, PALETTE as P, sideFrame, VILLAGE, VILLAGE_PLAN, WORLD_RADIUS } from "@vila/shared/game/world";

/** Cheap value noise: where the patches of snow lie. */
const noiseAt = (x: number, z: number) => Math.sin(x * 0.37 + z * 0.11) * Math.cos(z * 0.29 - x * 0.07);
/** A second, unrelated field: where the grass is darker. */
const shadeAt = (x: number, z: number) => Math.sin(x * 0.21 - z * 0.33) * Math.cos(z * 0.17 + x * 0.4);

/** Where people walk between rows of plots: the round street, the avenues and the street of every ring. */
export const ROAD_KINDS: readonly GroundKind[] = ["ring-street", "avenue", "street-premium", "street-standard", "street-economy"];
/** Unpaved ground beside a road: what a road has to stand out from. */
export const YARD_KINDS: readonly GroundKind[] = ["yard-premium", "yard-standard", "yard-economy", "yard-lot", "park", "snow"];
const ROADS = new Set<GroundKind>(ROAD_KINDS);
/** Ground that takes no kerb: every paving and the pond. */
const PAVED = new Set<GroundKind>([...ROAD_KINDS, "lane", "plaza", "pad", "path-premium", "path-standard", "ice", "civic", "square"]);

/** The tones each kind of ground may be painted with (the contrast test reads this, not the painter's branches). */
export const ROAD_TONES: readonly string[] = [P.asphalt, P.asphaltDark, P.cobble, P.cobbleDark, P.earthRoad, P.brickDark];
export const YARD_TONES: readonly string[] = [P.lawn, P.lawnDark, P.snow, P.snowShade, P.snowDeep];

/**
 * Whether a cell of an avenue lies where a ring street crosses it. `groundAt` answers "avenue" there (the
 * avenue is the straight view of the tree), so the junction is found here, for its paving only.
 */
function atJunction(x: number, z: number): boolean {
  const plan = VILLAGE_PLAN;
  const step = (2 * Math.PI) / plan.sides;
  const s = ((Math.round(Math.atan2(z, x) / step) % plan.sides) + plan.sides) % plan.sides;
  const f = sideFrame(plan, s);
  const apothem = x * f.nx + z * f.nz;
  return VILLAGE.rings.some((ring) => ring.street !== null && apothem >= ring.street[0] && apothem <= ring.street[1]);
}

const checker = (x: number, z: number, a: string, b: string) => ((((x + z) % 2) + 2) % 2 === 0 ? a : b);

/** Frosted grass, darker in patches, with snow where `snow` allows. */
function lawn(x: number, z: number, snow: number): string {
  const noise = noiseAt(x, z);
  if (noise > snow) return noise > snow + 0.12 ? P.snow : P.snowShade;
  return shadeAt(x, z) > 0.25 ? P.lawnDark : P.lawn;
}

/**
 * Colour of one ground cell. The paving is one of the cues of a residential tier (IMPL-0024, PROPOSTA):
 * dark cobbles and a paved path to each door on the premium street, asphalt and a gravel path on the standard
 * street, packed earth on the economy street.
 */
export function groundColor(kind: GroundKind, x: number, z: number): string {
  const r = Math.hypot(x, z);
  switch (kind) {
    case "plaza":
      return checker(x, z, P.paver, P.paverDark);
    case "ring-street":
      return Math.floor(r * 2) % 7 === 0 ? P.asphaltDark : P.asphalt;
    case "avenue":
      // A small paved square where a ring street crosses: the junction reads from above.
      if (atJunction(x, z)) return checker(x, z, P.paver, P.paverDark);
      return Math.floor(r) % 6 === 0 ? P.asphaltDark : P.asphalt;
    case "lane":
      // A footpath of brick between the plots, a darker course every fourth brick.
      return (((x + 2 * z) % 4) + 4) % 4 === 0 ? P.brickDark : P.brick;
    case "street-premium":
      return checker(x, z, P.cobble, P.cobbleDark);
    case "street-standard":
      return P.asphalt;
    case "street-economy":
      return noiseAt(x, z) < -0.5 ? P.brickDark : P.earthRoad;
    case "path-premium":
    case "square":
      return checker(x, z, P.paver, P.paverDark);
    case "pad":
      // One tone: the pad of every lot is drawn over it (`Lots`), and what shows is the step in front of a porch.
      return P.paver;
    case "civic":
      // The forecourt of a civic building: gravel from the street to its walls.
      return P.gravel;
    case "yard-lot":
      return lawn(x, z, 0.6);
    case "park":
      // A park is the greenest ground of the village: the darker grass, with little snow.
      return noiseAt(x, z) > 0.75 ? P.snowShade : shadeAt(x, z) > -0.3 ? P.lawnDark : P.lawn;
    case "path-standard":
      return P.gravel;
    case "yard-premium":
      return lawn(x, z, 0.62);
    case "yard-standard":
      return lawn(x, z, 0.55);
    case "yard-economy":
      return lawn(x, z, 0.5);
    case "ice":
      return P.ice;
    default: {
      // Open ground: grass with patches of snow inside the village, all snow where the world ends.
      const edge = Math.min(1, Math.max(0, (r - (WORLD_RADIUS - 6)) / 8));
      const noise = noiseAt(x, z);
      if (edge >= 1) return noise > 0.45 ? P.snowDeep : noise > -0.2 ? P.snow : P.snowShade;
      return lawn(x, z, 0.5 - 1.7 * edge);
    }
  }
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Colour of the cell at a point, kerbs included: an unpaved cell that touches a road is the road's kerb, so
 * every road keeps its whole width and has a light line along both sides.
 */
export function cellColor(x: number, z: number, kindAt: (x: number, z: number) => GroundKind = groundAt): string {
  const kind = kindAt(x, z);
  if (!PAVED.has(kind) && NEIGHBOURS.some(([dx, dz]) => ROADS.has(kindAt(x + dx, z + dz)))) return P.kerb;
  return groundColor(kind, x, z);
}

/** One run of ground cells of the same colour along x: `[x0, x1, z, colour]` (cell `n` spans `n ± 0.5`). */
export type GroundRun = [x0: number, x1: number, z: number, color: string];

/** Pieces the ground is drawn in: the square and its frontage, and a sector for each side of the village. */
export const GROUND_SECTORS = 8;
/** Radius of the middle piece: the square, its festive band and the frontage. */
export const GROUND_CORE = 36;
/** The piece a run belongs to, by its middle: 0 = the middle of the village, 1…`GROUND_SECTORS` = a sector around it. */
export function groundPiece([x0, x1, z]: GroundRun): number {
  const x = (x0 + x1) / 2;
  if (Math.hypot(x, z) <= GROUND_CORE) return 0;
  return 1 + ((Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * GROUND_SECTORS) % GROUND_SECTORS) + GROUND_SECTORS) % GROUND_SECTORS;
}

/**
 * The ground as runs of equal colour, row by row. The ground is flat, so neighbouring cells of one colour
 * are one quad: the village is five times larger than the first square (IMPL-0024) and costs about as many
 * triangles as that square did cell by cell. Only the top is drawn: the slab is never seen from the side or
 * from below (the snowfield lies around it). `groundAt` is asked once per cell (the kerbs read the grid).
 */
export function groundRuns(radius: number): GroundRun[] {
  const side = 2 * radius + 3;
  const kinds: GroundKind[] = new Array(side * side);
  for (let z = -radius - 1; z <= radius + 1; z++) for (let x = -radius - 1; x <= radius + 1; x++) kinds[(z + radius + 1) * side + x + radius + 1] = groundAt(x, z);
  const kindAt = (x: number, z: number) => kinds[(z + radius + 1) * side + x + radius + 1];
  const runs: GroundRun[] = [];
  for (let z = -radius; z <= radius; z++) {
    let run: GroundRun | null = null;
    for (let x = -radius; x <= radius; x++) {
      const c = Math.hypot(x, z) > radius ? null : cellColor(x, z, kindAt);
      if (run && c === run[3]) run[1] = x;
      else {
        if (run) runs.push(run);
        run = c === null ? null : [x, x, z, c];
      }
    }
    if (run) runs.push(run);
  }
  return runs;
}
