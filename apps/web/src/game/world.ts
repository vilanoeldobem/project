/**
 * World layout (first-slice proposal; final layout is PEN-017/PEN-023).
 * Unit = 1 voxel. The plaza is centred on the origin; the tree marks the global
 * donation point (example from P01, not a decision).
 */

export const PALETTE = {
  // Working palette from doc 17 (PROPOSAL, not approved).
  pine: "#173D35",
  gold: "#E6B765",
  red: "#9E3B3B",
  cream: "#FFF9ED",
  leaf: "#7C9A78",
  // Scene support colours — snowy Christmas village (IMPL-0006, PROPOSAL; replaces the summer study).
  // Snow is never pure white (spec §2.3): lit snow #F3F5F7, snow in shade #C6D8E6.
  terracotta: "#B4623F",
  snow: "#F3F5F7",
  snowShade: "#DCE7F0",
  snowDeep: "#C6D8E6",
  ice: "#A9D6EA",
  stone: "#C9CDD3",
  stoneDark: "#AEB6C1",
  street: "#B9C6D2",
  streetDark: "#A7B5C3",
  pineDark: "#174C42",
  pineLight: "#1F5E50",
  wood: "#8B5B41",
  trunk: "#6B4630",
  window: "#FFC785",
  coal: "#2B2F36",
  carrot: "#E8873A",
  skin: "#C98E6B",
  bulbRed: "#FF5A5A",
  bulbGreen: "#5BE08A",
  bulbBlue: "#6FB7FF",
} as const;

export const WORLD_RADIUS = 34;
export const PLAZA_RADIUS = 12;
export const STREET_INNER = 13;
export const STREET_OUTER = 17;
export const LOT_RING = 22;
export const TREE_RADIUS = 3.5;
export const INTERACT_DISTANCE = 4.5;

export interface LotDef {
  id: string;
  slot: number;
  x: number;
  z: number;
  /** Rotation (rad) so the lot faces the plaza. */
  facing: number;
}

/** Mirrors the `lots` rows (migrations 0002 + 0003). A test keeps them in sync. */
export const LOTS: LotDef[] = Array.from({ length: 8 }, (_, i) => {
  const a = (2 * Math.PI * i) / 8 + Math.PI / 8;
  const x = Math.round(LOT_RING * Math.cos(a) * 100) / 100;
  const z = Math.round(LOT_RING * Math.sin(a) * 100) / 100;
  return { id: `plaza-${String(i + 1).padStart(2, "0")}`, slot: i + 1, x, z, facing: Math.atan2(-x, -z) };
});

/** Hidden gifts (mission "find 2 gifts"). */
export const GIFTS = [
  { id: "gift-palm", x: 9.5, z: -9.5 },
  { id: "gift-bench", x: -10, z: 6 },
  { id: "gift-street", x: 0, z: 15 },
] as const;

/**
 * Snowy pines inside the walkable area (kept clear of lots, gifts, the pond and the sleigh).
 * The gift id "gift-palm" is a persisted mission event id and must not change even though palms
 * became pines (DEC-042 idempotency).
 */
export const PINES: [number, number][] = [
  [10, 10], [-10, -10], [-11, 9.5], [31, 7], [-30, 2], [3, -31], [26, 18], [-25, -19], [-24, 20], [24, -20], [-7, -31],
];

/** Decorative forest outside the walkable radius (no collision; frames the village). */
export const FOREST_INNER = WORLD_RADIUS + 4;
export const FOREST_OUTER = 62;

/** Frozen pond (decor, walkable: no gameplay effect). */
export const POND = { x: 28.5, z: -4, radius: 3.2 } as const;

/** Snowmen around the plaza (decor). */
export const SNOWMEN: [number, number, number][] = [
  [-5, -9.5, 0.6], [9.5, 4, -2.4], [-29, -9, 1.2],
];

/** Santa's parked sleigh with two reindeer (decor). Faces +x. */
export const SLEIGH = { x: -4, z: 30.5 } as const;

export const LAMPS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (2 * Math.PI * i) / 8;
  return [Math.round(12.2 * Math.cos(a) * 100) / 100, Math.round(12.2 * Math.sin(a) * 100) / 100];
});

export const SPAWN = { x: 0, z: 9 } as const;

/** Keeps the avatar inside the world and outside the tree. */
export function clampToWorld(x: number, z: number): [number, number] {
  let r = Math.hypot(x, z);
  if (r > WORLD_RADIUS) {
    x = (x / r) * WORLD_RADIUS;
    z = (z / r) * WORLD_RADIUS;
    r = WORLD_RADIUS;
  }
  if (r < TREE_RADIUS) {
    const k = r === 0 ? 1 : TREE_RADIUS / r;
    x = r === 0 ? TREE_RADIUS : x * k;
    z = z * k;
  }
  return [x, z];
}
