/**
 * Click-to-move navigation (pure, deterministic, IMPL-0016). A click is planned once, into a short list
 * of waypoints around the colliders; the fixed-step simulation (`motion.ts`) then walks them. Nothing here
 * runs while the avatar is idle, and walking a route allocates nothing.
 *
 * - **Field** (`createNavField`, built when the collider set changes): a 0.25 u grid over the world disc.
 *   A cell is free when an avatar centred on it keeps `NAV.clearance` from every collider. Free cells are
 *   grouped into regions; the largest one is the walkable village.
 * - **Plan** (`planRoute`, on click): resolve the destination to the nearest walkable point, go straight
 *   when it is in plain sight, otherwise A* over the grid (bounded by the number of free cells) followed by
 *   string pulling, so the route is a few straight legs instead of a staircase.
 * - **Walk** (`stepWalk`, every fixed step): steer at the current waypoint, switch to the next one as soon
 *   as it is in sight, replan if the body ever stops making progress. Giving up is the last resort.
 */
import { AVATAR_RADIUS, boundingRadius, clearance, type Collider, distanceTo } from "./collision";
import { type Body, type Intent, STEP, stepBody, type StepResult, type Target } from "./motion";
import { WORLD_RADIUS } from "./world";

export const NAV = {
  /** Grid cell edge (world units). */
  cell: 0.25,
  /** Room planned routes keep between the avatar's body and every collider. */
  clearance: 0.25,
  /** Sampling step of the line-of-sight test (half a cell: no free-looking line crosses a collider). */
  probe: 0.125,
  /** Near the avatar or the destination a line may run inside the clearance band, if it enters no collider. */
  lenient: 0.75,
  /** A waypoint counts as passed within this distance. */
  reach: 0.3,
  /** How far the avatar or the destination may be from the grid node that connects it to the route. */
  attach: 1.5,
  /** How far a body squeezed between colliders is led, cell by cell, back to open ground. */
  escape: 6,
  /** A blocked destination may resolve up to this much farther than the nearest cell, to stay on the avatar's side. */
  nearTie: 0.5,
  /** Replans after the body stops making progress, before the target is given up. */
  replans: 2,
} as const;

const HALF = Math.ceil(WORLD_RADIUS / NAV.cell);
/** Cells per side; cell (ix, iz) is centred on ((ix - HALF) * cell, (iz - HALF) * cell). */
const SIDE = 2 * HALF + 1;
const CELLS = SIDE * SIDE;
const DIAGONAL = Math.SQRT2;
/** Slightly more than 1: breaks the ties of the octile heuristic towards the goal (far fewer expansions). */
const GREED = 1.001;
/** Clearance that still counts as "not inside a collider" (the push-out leaves the body at exactly 0). */
const TOUCHING = -1e-6;

const at = (i: number) => (i - HALF) * NAV.cell;
const cellOf = (v: number) => Math.round(v / NAV.cell) + HALF;
const inGrid = (i: number) => i >= 0 && i < SIDE;
const inWorld = (x: number, z: number) => x * x + z * z <= WORLD_RADIUS * WORLD_RADIUS;

export interface NavField {
  colliders: readonly Collider[];
  /** 1 = an avatar centred on the cell is outside the world or closer than `NAV.clearance` to a collider. */
  blocked: Uint8Array;
  /** Region id of every free cell (4-connected), -1 when blocked. */
  region: Int32Array;
  /** Free cells per region. */
  regionSizes: number[];
  /** The largest region: everywhere the avatar can walk to. -1 when nothing is free. */
  main: number;
  /** Free cells in the main region: the upper bound of a search. */
  walkable: number;
}

/** Builds the navigation field for a collider set. Linear in grid cells plus collider areas (about 1 ms). */
export function createNavField(colliders: readonly Collider[]): NavField {
  const blocked = new Uint8Array(CELLS);
  for (let iz = 0; iz < SIDE; iz++) for (let ix = 0; ix < SIDE; ix++) if (!inWorld(at(ix), at(iz))) blocked[iz * SIDE + ix] = 1;
  const keep = AVATAR_RADIUS + NAV.clearance;
  for (const c of colliders) {
    const reach = boundingRadius(c) + keep;
    const x0 = Math.max(0, cellOf(c.x - reach) - 1), x1 = Math.min(SIDE - 1, cellOf(c.x + reach) + 1);
    const z0 = Math.max(0, cellOf(c.z - reach) - 1), z1 = Math.min(SIDE - 1, cellOf(c.z + reach) + 1);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * SIDE + ix;
        if (!blocked[i] && distanceTo(c, at(ix), at(iz)) < keep) blocked[i] = 1;
      }
  }

  const region = new Int32Array(CELLS).fill(-1);
  const regionSizes: number[] = [];
  const queue = new Int32Array(CELLS);
  for (let seed = 0; seed < CELLS; seed++) {
    if (blocked[seed] || region[seed] >= 0) continue;
    const id = regionSizes.length;
    let head = 0, tail = 0;
    queue[tail++] = seed;
    region[seed] = id;
    while (head < tail) {
      const cur = queue[head++];
      const ix = cur % SIDE;
      for (let k = 0; k < 4; k++) {
        if ((k === 0 && ix === 0) || (k === 1 && ix === SIDE - 1)) continue;
        const next = cur + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -SIDE : SIDE);
        if (next < 0 || next >= CELLS || blocked[next] || region[next] >= 0) continue;
        region[next] = id;
        queue[tail++] = next;
      }
    }
    regionSizes.push(tail);
  }
  let main = -1;
  for (let id = 0; id < regionSizes.length; id++) if (main < 0 || regionSizes[id] > regionSizes[main]) main = id;
  return { colliders, blocked, region, regionSizes, main, walkable: main < 0 ? 0 : regionSizes[main] };
}

/** True when an avatar centred on the point keeps the planning clearance and stands inside the world. */
export const isOpen = (field: NavField, x: number, z: number): boolean =>
  inWorld(x, z) && clearance(field.colliders, x, z) >= NAV.clearance;

/**
 * Line of sight for the avatar's body: every probe along the segment lies in a free cell. Within
 * `NAV.lenient` of an end flagged as lenient (the avatar itself, or the destination) a probe may also sit
 * inside the clearance band, provided the body would not enter a collider there: that is how a walk starts
 * from a spot right next to an obstacle, even one the body is touching. Allocation-free.
 */
export function lineClear(field: NavField, ax: number, az: number, bx: number, bz: number, lenientA = false, lenientB = false): boolean {
  const dx = bx - ax, dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.ceil(len / NAV.probe));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + dx * t, z = az + dz * t;
    const ix = cellOf(x), iz = cellOf(z);
    if (inGrid(ix) && inGrid(iz) && !field.blocked[iz * SIDE + ix]) continue;
    if (i === 0 && lenientA) continue; // where the avatar already stands
    const nearA = lenientA && t * len <= NAV.lenient, nearB = lenientB && (1 - t) * len <= NAV.lenient;
    if ((nearA || nearB) && inWorld(x, z) && clearance(field.colliders, x, z) >= TOUCHING) continue;
    return false;
  }
  return true;
}

/** Nearest cell of the walkable region that the point sees (lenient at the point) within `NAV.attach`, or -1. */
function attach(field: NavField, x: number, z: number): number {
  const span = Math.ceil(NAV.attach / NAV.cell);
  const cx = cellOf(x), cz = cellOf(z);
  let best = -1, bestD = NAV.attach * NAV.attach;
  for (let iz = cz - span; iz <= cz + span; iz++)
    for (let ix = cx - span; ix <= cx + span; ix++) {
      if (!inGrid(ix) || !inGrid(iz)) continue;
      const i = iz * SIDE + ix;
      if (field.region[i] !== field.main) continue;
      const ddx = at(ix) - x, ddz = at(iz) - z;
      const d = ddx * ddx + ddz * ddz;
      if (d >= bestD || !lineClear(field, x, z, at(ix), at(iz), true, false)) continue;
      best = i;
      bestD = d;
    }
  return best;
}

/** A planned walk. One instance is reused for every click: planning refills it, walking only reads it. */
export interface Route {
  active: boolean;
  /** Waypoints, the destination last; `count` of them are valid and `index` is the one being walked to. */
  xs: number[];
  zs: number[];
  /** Path length left after each waypoint (0 for the destination). */
  rest: number[];
  count: number;
  index: number;
  /** The destination: the request itself, or the nearest walkable point when the request is not. */
  x: number;
  z: number;
  /** True when no route could be planned: steer straight and let the stuck timer decide (last resort). */
  direct: boolean;
  /** Replans used since the click. */
  replans: number;
  /** Grid nodes expanded by the last plan (0 when the destination was in plain sight). */
  expanded: number;
  /** Scratch target handed to `stepBody`. */
  aim: Target;
}

export const createRoute = (): Route => ({
  active: false, xs: [], zs: [], rest: [], count: 0, index: 0, x: 0, z: 0, direct: false, replans: 0, expanded: 0,
  aim: { x: 0, z: 0, rest: 0 },
});

/** Search scratch, shared by every field (same grid size) and allocated on the first search. */
interface Scratch {
  g: Float64Array;
  f: Float64Array;
  parent: Int32Array;
  seen: Uint32Array;
  heap: Int32Array;
  slot: Int32Array;
  path: Int32Array;
}
let scratch: Scratch | null = null;
let generation = 0;
/** The scratch arrays with a fresh visit generation (`seen[i] === generation` = visited by this search). */
function nextSearch(): Scratch {
  const s = (scratch ??= {
    g: new Float64Array(CELLS), f: new Float64Array(CELLS), parent: new Int32Array(CELLS), seen: new Uint32Array(CELLS),
    heap: new Int32Array(CELLS), slot: new Int32Array(CELLS), path: new Int32Array(CELLS),
  });
  if (++generation > 0xfffffff0) {
    s.seen.fill(0);
    generation = 1;
  }
  return s;
}
/** Result of `resolve` (module scratch: planning is synchronous and single-threaded). */
const goal = { x: 0, z: 0, cell: -1 };
const rawX: number[] = [], rawZ: number[] = [], midX: number[] = [], midZ: number[] = [];

/**
 * Resolves a requested destination to a point the avatar can stand on and walk to: the request itself
 * when it is open ground, otherwise the nearest spot of the walkable region (clamped into the world,
 * pushed out of obstacles), preferring the avatar's side among near ties. Fills `goal`.
 */
function resolve(field: NavField, sx: number, sz: number, tx: number, tz: number): boolean {
  const r = Math.hypot(tx, tz);
  if (r > WORLD_RADIUS) {
    const k = (WORLD_RADIUS * (1 - 1e-9)) / r;
    tx *= k;
    tz *= k;
  }
  if (isOpen(field, tx, tz)) {
    const cell = attach(field, tx, tz);
    if (cell >= 0) {
      goal.x = tx;
      goal.z = tz;
      goal.cell = cell;
      return true;
    }
  }
  const { region, main } = field;
  let nearest = Infinity;
  for (let i = 0; i < CELLS; i++) {
    if (region[i] !== main) continue;
    const dx = at(i % SIDE) - tx, dz = at((i / SIDE) | 0) - tz;
    const d = dx * dx + dz * dz;
    if (d < nearest) nearest = d;
  }
  if (nearest === Infinity) return false;
  // Near ties go to the avatar's side. The window shrinks with the depth, so a click that only grazes an
  // obstacle's clearance band still resolves right next to where it landed.
  const depth = Math.sqrt(nearest);
  const limit = (depth + Math.min(NAV.nearTie, depth)) ** 2;
  let cell = -1, toStart = Infinity;
  for (let i = 0; i < CELLS; i++) {
    if (region[i] !== main) continue;
    const x = at(i % SIDE), z = at((i / SIDE) | 0);
    if ((x - tx) * (x - tx) + (z - tz) * (z - tz) > limit) continue;
    const d = (x - sx) * (x - sx) + (z - sz) * (z - sz);
    if (d < toStart) {
      toStart = d;
      cell = i;
    }
  }
  // From that cell, walk towards the request while the ground stays open, then close in on the edge:
  // the destination ends right at the obstacle (or at the request, if the cell sees it).
  const cx = at(cell % SIDE), cz = at((cell / SIDE) | 0);
  const steps = Math.max(1, Math.ceil(Math.hypot(tx - cx, tz - cz) / NAV.probe));
  let lo = 0, hi = 1;
  for (let k = 1; k <= steps; k++) {
    if (!isOpen(field, cx + ((tx - cx) * k) / steps, cz + ((tz - cz) * k) / steps)) {
      hi = k / steps;
      break;
    }
    lo = k / steps;
  }
  for (let k = 0; k < 8 && lo < hi; k++) {
    const mid = (lo + hi) / 2;
    if (isOpen(field, cx + (tx - cx) * mid, cz + (tz - cz) * mid)) lo = mid;
    else hi = mid;
  }
  goal.x = cx + (tx - cx) * lo;
  goal.z = cz + (tz - cz) * lo;
  goal.cell = cell;
  return true;
}

/** A* over the walkable region from `from` to `to`; writes the cells (goal first) to `scratch.path`. */
function search(field: NavField, from: number, to: number, route: Route): number {
  const s = nextSearch();
  const { g, f, parent, seen, heap, slot } = s;
  const { blocked } = field;
  const tx = to % SIDE, tz = (to / SIDE) | 0;
  const before = (a: number, b: number) => f[a] < f[b] || (f[a] === f[b] && a < b);
  let size = 0;
  const up = (i: number) => {
    const node = heap[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(node, heap[p])) break;
      heap[i] = heap[p];
      slot[heap[i]] = i;
      i = p;
    }
    heap[i] = node;
    slot[node] = i;
  };
  const down = (i: number) => {
    const node = heap[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && before(heap[c + 1], heap[c])) c++;
      if (!before(heap[c], node)) break;
      heap[i] = heap[c];
      slot[heap[i]] = i;
      i = c;
    }
    heap[i] = node;
    slot[node] = i;
  };

  seen[from] = generation;
  g[from] = 0;
  f[from] = 0;
  parent[from] = -1;
  heap[size++] = from;
  slot[from] = 0;
  while (size > 0) {
    const cur = heap[0];
    slot[cur] = -1;
    if (--size > 0) {
      heap[0] = heap[size];
      down(0);
    }
    if (cur === to) break;
    route.expanded++;
    const cx = cur % SIDE, cz = (cur / SIDE) | 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!inGrid(nx) || !inGrid(nz)) continue;
        const next = nz * SIDE + nx;
        if (blocked[next]) continue;
        // No corner cutting: a diagonal step needs both cells it squeezes between.
        if (dx !== 0 && dz !== 0 && (blocked[cur + dx] || blocked[cur + dz * SIDE])) continue;
        const cost = g[cur] + (dx !== 0 && dz !== 0 ? DIAGONAL : 1);
        const fresh = seen[next] !== generation;
        if (!fresh && (slot[next] < 0 || cost >= g[next])) continue;
        const ax = Math.abs(nx - tx), az = Math.abs(nz - tz);
        g[next] = cost;
        f[next] = cost + GREED * (ax > az ? ax + (DIAGONAL - 1) * az : az + (DIAGONAL - 1) * ax);
        parent[next] = cur;
        if (fresh) {
          seen[next] = generation;
          heap[size] = next;
          slot[next] = size;
          up(size++);
        } else up(slot[next]);
      }
  }
  let n = 0;
  for (let c = to; c >= 0; c = parent[c]) s.path[n++] = c;
  return n;
}

/**
 * Way out for a body that sees no walkable cell: it was pushed into a nook between colliders, where the
 * planning clearance does not fit but the body does. Breadth-first over cells the body physically fits in
 * (within `NAV.escape`), up to the first cell of the walkable region. Writes the cells (that one first) to
 * `scratch.path`; 0 when there is no way out. Rare, and bounded by the window: (2 · escape / cell)² cells.
 */
function escape(field: NavField, sx: number, sz: number): number {
  const s = nextSearch();
  const { parent, seen, heap: queue } = s;
  const cx = cellOf(sx), cz = cellOf(sz);
  if (!inGrid(cx) || !inGrid(cz)) return 0;
  const span = Math.ceil(NAV.escape / NAV.cell);
  const start = cz * SIDE + cx;
  let head = 0, tail = 0;
  queue[tail++] = start;
  seen[start] = generation;
  parent[start] = -1;
  while (head < tail) {
    const cur = queue[head++];
    if (field.region[cur] === field.main) {
      let n = 0;
      for (let c = cur; c !== start; c = parent[c]) s.path[n++] = c;
      return n;
    }
    const ix = cur % SIDE, iz = (cur / SIDE) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = ix + (k === 0 ? -1 : k === 1 ? 1 : 0), nz = iz + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (!inGrid(nx) || !inGrid(nz) || Math.abs(nx - cx) > span || Math.abs(nz - cz) > span) continue;
      const next = nz * SIDE + nx;
      if (seen[next] === generation) continue;
      seen[next] = generation;
      if (field.blocked[next] && !(inWorld(at(nx), at(nz)) && clearance(field.colliders, at(nx), at(nz)) >= 0)) continue;
      parent[next] = cur;
      queue[tail++] = next;
    }
  }
  return 0;
}

/** String pulling: from each kept point, skip ahead to the last point still in plain sight. */
function pull(field: NavField, sx: number, sz: number, inX: number[], inZ: number[], n: number, outX: number[], outZ: number[]): number {
  let ax = sx, az = sz, i = 0, count = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && lineClear(field, ax, az, inX[j + 1], inZ[j + 1], i === 0, j + 1 === n - 1)) j++;
    outX[count] = ax = inX[j];
    outZ[count++] = az = inZ[j];
    i = j + 1;
  }
  return count;
}

/** A route of one straight leg. */
function single(route: Route, x: number, z: number, direct: boolean): void {
  route.xs[0] = route.x = x;
  route.zs[0] = route.z = z;
  route.rest[0] = 0;
  route.count = 1;
  route.direct = direct;
}

/**
 * Plans a walk from `(sx, sz)` to the walkable point nearest to `(tx, tz)` and activates the route.
 * `route.x`/`route.z` hold the resolved destination. Cost: nothing but one line-of-sight test when the
 * destination is in plain sight; otherwise at most `field.walkable` node expansions.
 */
export function planRoute(field: NavField, route: Route, sx: number, sz: number, tx: number, tz: number): void {
  route.active = true;
  route.index = 0;
  route.replans = 0;
  route.expanded = 0;
  if (field.main < 0 || !resolve(field, sx, sz, tx, tz)) return single(route, tx, tz, true);
  const gx = goal.x, gz = goal.z;
  if (lineClear(field, sx, sz, gx, gz, true, true)) return single(route, gx, gz, false);
  const target = goal.cell;
  let n = 0;
  let from = attach(field, sx, sz);
  if (from < 0) {
    // No walkable cell in sight: squeezed between colliders. Lead the body out first, cell by cell.
    const out = escape(field, sx, sz);
    if (out === 0) return single(route, gx, gz, true);
    const lead = scratch!.path;
    from = lead[0];
    for (let k = out - 1; k > 0; k--) {
      rawX[n] = at(lead[k] % SIDE);
      rawZ[n++] = at((lead[k] / SIDE) | 0);
    }
  }
  const cells = search(field, from, target, route);
  const path = scratch!.path;
  for (let k = cells - 1; k >= 0; k--) {
    rawX[n] = at(path[k] % SIDE);
    rawZ[n++] = at((path[k] / SIDE) | 0);
  }
  rawX[n] = gx;
  rawZ[n++] = gz;
  n = pull(field, sx, sz, rawX, rawZ, n, midX, midZ);
  n = pull(field, sx, sz, midX, midZ, n, route.xs, route.zs);
  route.count = n;
  route.x = gx;
  route.z = gz;
  route.direct = false;
  route.rest[n - 1] = 0;
  for (let k = n - 2; k >= 0; k--) route.rest[k] = route.rest[k + 1] + Math.hypot(route.xs[k + 1] - route.xs[k], route.zs[k + 1] - route.zs[k]);
}

const IDLE: Intent = { moveX: 0, moveZ: 0, target: null };
const WALK: Intent = { moveX: 0, moveZ: 0, target: null };

/**
 * One fixed step of the avatar. With an active `route` it steers at the current waypoint, moving on to the
 * next as soon as it is reached or in plain sight; otherwise (no route, or `null` while a panel is open)
 * the body just brakes. `targetDone` means the walk ended: arrived, or given up after the replans ran out.
 */
export function stepWalk(b: Body, route: Route | null, field: NavField | null, colliders: readonly Collider[], dt = STEP): StepResult {
  if (!route || !route.active) return stepBody(b, IDLE, colliders, dt);
  const { xs, zs, aim } = route;
  const last = route.count - 1;
  while (route.index < last) {
    const i = route.index;
    const dx = xs[i] - b.x, dz = zs[i] - b.z;
    if (dx * dx + dz * dz >= NAV.reach * NAV.reach && !(field && lineClear(field, b.x, b.z, xs[i + 1], zs[i + 1], true, i + 1 === last))) break;
    route.index++;
  }
  aim.x = xs[route.index];
  aim.z = zs[route.index];
  aim.rest = route.rest[route.index];
  WALK.target = aim;
  const result = stepBody(b, WALK, colliders, dt);
  if (!result.targetDone) return result;
  if (!result.arrived && field && route.replans < NAV.replans) {
    // Stopped making progress (pushed off the route, or steering straight): plan again from here.
    const used = route.replans + 1;
    planRoute(field, route, b.x, b.z, route.x, route.z);
    route.replans = used;
    result.targetDone = false;
    return result;
  }
  route.active = false;
  return result;
}
