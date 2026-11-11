/** Code-generated voxel models: [x, y, z, colour]. Origin on the ground, model centred. */
import { PALETTE as P } from "@vila/shared/game/world";

export type Voxel = [number, number, number, string];

/** Snow resting on pine layers (own colour so it sways together with the foliage). */
export const PINE_SNOW = "#EEF3F7";
export const BULBS = [P.gold, P.bulbRed, P.bulbGreen, P.bulbBlue];
export const SWAY = [P.pineDark, P.pineLight, PINE_SNOW];

function box(v: Voxel[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) v.push([x, y, z, c]);
}

/** Central Christmas tree: layered pine, snow on exposed tops, coloured bulbs, red ornaments, star. */
export function tree(): Voxel[] {
  const v: Voxel[] = [];
  for (let y = 0; y < 2; y++) v.push([0, y, 0, P.trunk]);
  const layers = [4, 4, 3, 3, 2, 2, 1, 1, 0];
  layers.forEach((r, i) => {
    const y = 2 + i;
    const above = layers[i + 1] ?? -1;
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        const d2 = x * x + z * z;
        if (d2 > r * r + r) continue;
        const edge = d2 >= (r - 0.5) * (r - 0.5);
        const ornament = edge && (x * 7 + z * 13 + y * 5) % 9 === 0;
        const light = edge && !ornament && (x * 3 + z * 5 + y) % 7 === 0;
        const snowy = !edge && d2 > above * above + above && (x * 5 + z * 3 + y) % 3 !== 0;
        const c = ornament
          ? P.red
          : light
            ? BULBS[Math.abs(x * 11 + z * 7 + y * 3) % BULBS.length]
            : snowy
              ? P.snow
              : i % 2
                ? "#2F6B4F"
                : "#3D7F5B";
        v.push([x, y, z, c]);
      }
  });
  const top = 2 + layers.length;
  for (const [x, y] of [[0, 0], [0, 1], [0, 2], [-1, 1], [1, 1]] as const) v.push([x, top + y, 0, P.gold]);
  return v;
}

/** Snowy pine (two sizes). Foliage and its snow sway with the wind; the trunk does not. */
export function pine(tall = false): Voxel[] {
  const v: Voxel[] = [];
  const trunk = tall ? 2 : 1;
  for (let y = 0; y < trunk; y++) v.push([0, y, 0, P.trunk]);
  const layers = tall ? [3, 3, 2, 2, 2, 1, 1, 0, 0] : [2, 2, 1, 1, 0, 0];
  layers.forEach((r, i) => {
    const y = trunk + i;
    const above = layers[i + 1] ?? -1;
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        const d2 = x * x + z * z;
        if (d2 > r * r + r * 0.5) continue;
        const exposed = d2 > above * above + above * 0.5 || i === layers.length - 1;
        v.push([x, y, z, exposed && (x + z + i) % 2 === 0 ? PINE_SNOW : i % 2 ? P.pineLight : P.pineDark]);
      }
  });
  return v;
}

/** Street lamp (draw with size 0.5): dark pole, warm lantern, small wreath, snow cap. */
export function lamp(): Voxel[] {
  const v: Voxel[] = [];
  for (let y = 0; y < 6; y++) v.push([0, y, 0, P.pine]);
  v.push([0, 6, 0, P.gold], [0, 7, 0, P.pine], [0, 8, 0, P.snow]);
  // Wreath facing +z at mid height.
  for (const [x, y] of [[-1, 3], [1, 3], [0, 2], [0, 4], [-1, 4], [1, 2]] as const) v.push([x, y, 1, P.pineLight]);
  v.push([0, 2, 1, P.red]);
  return v;
}

export function bench(): Voxel[] {
  return [[-1, 0, 0, P.trunk], [1, 0, 0, P.trunk], [-1, 1, 0, P.wood], [0, 1, 0, P.snowShade], [1, 1, 0, P.wood]];
}

/** "Available lot" sign plus low corner posts, snow on top. Lot front is local +z. */
export function lotMarker(): Voxel[] {
  const v: Voxel[] = [];
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) v.push([x, 0, z, P.cream], [x, 1, z, P.snow]);
  v.push([0, 0, 2, P.trunk], [0, 1, 2, P.trunk]);
  for (let x = -1; x <= 1; x++) v.push([x, 2, 2, P.cream], [x, 3, 2, P.snow]);
  v.push([0, 4, 2, P.red]);
  return v;
}

/** Snowman (draw with size 0.4). Front = +z. */
export function snowman(): Voxel[] {
  const v: Voxel[] = [];
  const ball = (cy: number, r: number) => {
    for (let x = -r; x <= r; x++)
      for (let y = -r; y <= r; y++)
        for (let z = -r; z <= r; z++)
          if (x * x + y * y + z * z <= r * r + 0.5) v.push([x, cy + y, z, (x + y + z) % 4 === 0 ? P.snowShade : P.snow]);
  };
  ball(2, 2);
  ball(5, 1.5);
  ball(7, 1);
  v.push([-1, 7, 1.6, P.coal], [1, 7, 1.6, P.coal], [0, 7, 2, P.carrot], [0, 6.6, 2.4, P.carrot]);
  v.push([0, 5, 1.6, P.coal], [0, 4, 1.8, P.coal], [0, 2, 2.2, P.coal]);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.push([x, 6, z, P.red]); // scarf
  v.push([1, 5, 1.6, P.red]);
  box(v, -1, 1, 8, 9, -1, 1, P.coal); // hat
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) === 2 || Math.abs(z) === 2) v.push([x, 8, z, P.coal]);
  return v;
}

/** Parked sleigh with a gift sack (draw with size 0.5). Faces +x. */
export function sleigh(): Voxel[] {
  const v: Voxel[] = [];
  for (let x = -3; x <= 4; x++) v.push([x, 0, -2, P.gold], [x, 0, 2, P.gold]); // runners
  v.push([5, 1, -2, P.gold], [5, 1, 2, P.gold]);
  box(v, -3, 3, 1, 1, -2, 2, P.red); // floor
  box(v, -3, -3, 2, 4, -2, 2, P.red); // back
  box(v, -3, 3, 2, 2, -2, -2, P.red); // sides
  box(v, -3, 3, 2, 2, 2, 2, P.red);
  for (let x = -3; x <= 3; x++) v.push([x, 3, -2, P.gold], [x, 3, 2, P.gold]);
  box(v, 3, 3, 2, 3, -2, 2, P.red); // front
  box(v, -2, -1, 2, 4, -1, 1, P.wood); // sack
  v.push([-2, 5, 0, P.gold]);
  box(v, 0, 1, 2, 2, -1, 1, P.pineLight);
  v.push([0, 3, 0, P.red], [1, 3, 0, P.bulbBlue], [0, 4, 0, P.gold]);
  // Snow on the seat edges.
  v.push([-3, 5, -1, P.snow], [-3, 5, 1, P.snow], [-3, 5, 0, P.snow]);
  return v;
}

/** Reindeer (draw with size 0.35). Faces +x. */
export function reindeer(): Voxel[] {
  const v: Voxel[] = [];
  const fur = "#8B5B41", light = "#C9A27E", antler = "#E6D2B0";
  for (const x of [-2, 2]) for (const z of [-1, 1]) box(v, x, x, 0, 3, z, z, fur); // legs
  box(v, -3, 3, 4, 6, -1, 1, fur); // body
  box(v, -2, 2, 4, 4, -1, 1, light); // belly
  box(v, 3, 4, 7, 9, 0, 0, fur); // neck
  box(v, 4, 6, 9, 10, -1, 1, fur); // head
  v.push([7, 9, 0, P.coal], [5, 10, -1.6, P.coal], [5, 10, 1.6, P.coal]);
  for (const z of [-1, 1]) v.push([4, 11, z, antler], [4, 12, z, antler], [3, 13, z * 2, antler], [5, 13, z * 2, antler], [4, 13, z, antler]);
  v.push([-4, 6, 0, light]); // tail
  box(v, -1, 1, 7, 7, -1, 1, P.red); // harness
  v.push([0, 7, 2, P.gold]);
  return v;
}

/** Avatar voxel size and the pivot heights (world units) of its animated limbs. */
export const AVATAR_SIZE = 0.3;
export const HIP_Y = 3 * AVATAR_SIZE;
export const SHOULDER_Y = 6 * AVATAR_SIZE;

/** Walk cycle shared by the local and remote avatars: limb swing (rad) and body lift (units). */
export const walkSwing = (phase: number, run: number) => Math.sin(phase) * 0.75 * run;
export const walkLift = (phase: number, run: number) => Math.abs(Math.sin(phase)) * 0.09 * run;

export interface AvatarParts {
  body: Voxel[];
  /** Limbs hang below their pivot (y < 0); the pivot sits at x = ±1 (legs) or ±2 (arms) voxels. */
  legL: Voxel[];
  legR: Voxel[];
  armL: Voxel[];
  armR: Voxel[];
}

/**
 * Default avatar wearing a Santa hat, split into body and four limbs so it can walk (draw with
 * AVATAR_SIZE). Front = +z. The avatar editor is P07 (DEC-032).
 */
export function avatarParts(): AvatarParts {
  const body: Voxel[] = [];
  box(body, -1, 1, 3, 5, 0, 0, P.red); // torso
  box(body, -1, 1, 3, 3, 0, 0, P.cream); // belt trim
  box(body, -1, 1, 6, 8, -1, 1, P.skin); // head
  body.push([-1, 7, 1.5, "#1D2B27"], [1, 7, 1.5, "#1D2B27"]); // eyes
  box(body, -1, 1, 9, 9, -1, 1, P.cream); // hat brim
  box(body, -1, 0, 10, 10, -1, 0, P.red);
  body.push([0, 11, 0, P.cream]);
  const leg = (): Voxel[] => [[0, -3, 0, "#2E3A4A"], [0, -2, 0, "#2E3A4A"], [0, -1, 0, "#2E3A4A"]];
  const arm = (): Voxel[] => [[0, -3, 0, P.skin], [0, -2, 0, P.red], [0, -1, 0, P.red]];
  return { body, legL: leg(), legR: leg(), armL: arm(), armR: arm() };
}
