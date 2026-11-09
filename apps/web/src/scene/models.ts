/** Code-generated voxel models: [x, y, z, colour]. Origin on the ground, model centred. */
import { PALETTE as P } from "../game/world";

export type Voxel = [number, number, number, string];

export function tree(): Voxel[] {
  const v: Voxel[] = [];
  for (let y = 0; y < 2; y++) v.push([0, y, 0, P.trunk]);
  const layers = [4, 4, 3, 3, 2, 2, 1, 1, 0];
  layers.forEach((r, i) => {
    const y = 2 + i;
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        if (x * x + z * z > r * r + r) continue;
        const edge = x * x + z * z >= (r - 0.5) * (r - 0.5);
        const ornament = edge && (x * 7 + z * 13 + y * 5) % 9 === 0;
        const light = edge && !ornament && (x * 3 + z * 5 + y) % 7 === 0;
        v.push([x, y, z, ornament ? P.red : light ? P.gold : i % 2 ? "#2F6B4F" : "#3D7F5B"]);
      }
  });
  // Star
  const top = 2 + layers.length;
  for (const [x, y] of [[0, 0], [0, 1], [0, 2], [-1, 1], [1, 1]] as const) v.push([x, top + y, 0, P.gold]);
  return v;
}

export function palm(): Voxel[] {
  const v: Voxel[] = [];
  for (let y = 0; y < 6; y++) v.push([y > 3 ? 1 : 0, y, 0, y % 2 ? P.trunk : "#8B6340"]);
  const cx = 1, cy = 6;
  v.push([cx, cy, 0, P.leaf]);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    for (let k = 1; k <= 3; k++) v.push([cx + dx * k, cy - (k === 3 ? 1 : 0), dz * k, k === 3 ? P.grassDark : P.leaf]);
  return v;
}

/** Street lamp (draw with size 0.5): thin pole, gold lantern. */
export function lamp(): Voxel[] {
  const v: Voxel[] = [[0, 0, 0, P.pine]];
  for (let y = 1; y < 6; y++) v.push([0, y, 0, P.pine]);
  v.push([0, 6, 0, P.gold], [0, 7, 0, P.pine]);
  return v;
}

export function gift(color: string): Voxel[] {
  return [[0, 0, 0, color], [0, 1, 0, P.gold]];
}

export function bench(): Voxel[] {
  return [[-1, 0, 0, P.trunk], [1, 0, 0, P.trunk], [-1, 1, 0, P.terracotta], [0, 1, 0, P.terracotta], [1, 1, 0, P.terracotta]];
}

/** "Available lot" sign plus low corner posts. Lot front is local +z. */
export function lotMarker(): Voxel[] {
  const v: Voxel[] = [];
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) v.push([x, 0, z, P.cream]);
  v.push([0, 0, 2, P.trunk], [0, 1, 2, P.trunk]);
  for (let x = -1; x <= 1; x++) v.push([x, 2, 2, P.cream]);
  v.push([0, 3, 2, P.red]);
  return v;
}

/** Small house (published lot): cream walls, terracotta roof, gold door. */
export function house(): Voxel[] {
  const v: Voxel[] = [];
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++)
      for (let y = 0; y < 3; y++) {
        if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
        const door = z === 2 && x === 0 && y < 2;
        v.push([x, y, z, door ? P.gold : P.cream]);
      }
  for (let y = 0; y < 3; y++)
    for (let x = -3 + y; x <= 3 - y; x++) for (let z = -3; z <= 3; z++) v.push([x, 3 + y, z, P.terracotta]);
  return v;
}

/** Default avatar (draw with size 0.3) wearing a Santa hat. The avatar editor is P07 (DEC-032). */
export function avatar(): Voxel[] {
  const v: Voxel[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) v.push([x, y, z, c]);
  };
  box(-1, -1, 0, 2, 0, 0, "#2E3A4A"); // legs
  box(1, 1, 0, 2, 0, 0, "#2E3A4A");
  box(-1, 1, 3, 5, 0, 0, P.red); // torso
  box(-1, 1, 3, 3, 0, 0, P.cream); // belt trim
  box(-2, -2, 3, 5, 0, 0, P.skin); // arms
  box(2, 2, 3, 5, 0, 0, P.skin);
  box(-1, 1, 6, 8, -1, 1, P.skin); // head
  v.push([-1, 7, 1.5, "#1D2B27"], [1, 7, 1.5, "#1D2B27"]); // eyes (front = +z)
  box(-1, 1, 9, 9, -1, 1, P.cream); // hat brim
  box(-1, 0, 10, 10, -1, 0, P.red);
  v.push([0, 11, 0, P.cream]);
  return v;
}
