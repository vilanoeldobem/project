/** Reusable voxel parts for generators (IMPL-0010). All take integer coordinates; models sit on y = 0. */
import type { Voxel } from "../models";

/** Fills an axis-aligned box (inclusive bounds). */
export function box(v: Voxel[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string | ((x: number, y: number, z: number) => string)) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) v.push([x, y, z, typeof c === "string" ? c : c(x, y, z)]);
}

/** Hollow box walls (no top/bottom), for buildings. */
export function walls(v: Voxel[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: (x: number, y: number, z: number) => string) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) v.push([x, y, z, c(x, y, z)]);
}

/** Filled disc of radius r at height y. */
export function disc(v: Voxel[], cx: number, cz: number, y: number, r: number, c: string) {
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + r * 0.5) v.push([cx + x, y, cz + z, c]);
}

/** Last voxel per cell wins (later parts paint over earlier ones). */
export function dedupe(v: Voxel[]): Voxel[] {
  const m = new Map<string, Voxel>();
  for (const p of v) m.set(`${p[0]},${p[1]},${p[2]}`, p);
  return [...m.values()];
}

/** Rotates by quarter turns around Y. */
export function rotate(v: Voxel[], quarter: number): Voxel[] {
  return v.map(([x, y, z, c]) => {
    let rx = x, rz = z;
    for (let q = 0; q < (quarter & 3); q++) [rx, rz] = [-rz, rx];
    return [rx, y, rz, c];
  });
}

/**
 * Snow on every exposed top: adds a snow voxel above the highest voxel of each column, where `keep`
 * allows (lets generators leave gaps so snow reads as patches, not a lid).
 */
export function snowCap(v: Voxel[], color: string, keep: (x: number, z: number) => boolean = () => true): Voxel[] {
  const top = new Map<string, number>();
  for (const [x, y, z] of v) {
    const k = `${x},${z}`;
    top.set(k, Math.max(top.get(k) ?? -Infinity, y));
  }
  const out = [...v];
  for (const [k, y] of top) {
    const [x, z] = k.split(",").map(Number);
    if (keep(x, z)) out.push([x, y + 1, z, color]);
  }
  return out;
}

/** Shifts the model so its lowest voxel sits on y = 0 and x/z are centred on integers. */
export function ground(v: Voxel[]): Voxel[] {
  if (v.length === 0) return v;
  let minY = Infinity;
  for (const p of v) minY = Math.min(minY, p[1]);
  return v.map(([x, y, z, c]) => [x, y - minY, z, c]);
}
