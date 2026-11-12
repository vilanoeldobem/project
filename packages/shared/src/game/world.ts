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

/**
 * Generated villagers and animals placed as decor (IMPL-0010, PROPOSTA; final layout is PEN-017).
 * `kind` = generator id, `seed` fixes the variant for every visitor. `y` lifts perched animals.
 * Ground-level ones block the avatar (see OBSTACLES); none affects missions or XP.
 */
export interface Critter {
  kind: "villager" | "dog" | "cat" | "bird" | "rabbit" | "owl";
  seed: string;
  x: number;
  z: number;
  y?: number;
  /** Rotation around Y (rad). */
  rot: number;
}

export const CRITTERS: Critter[] = [
  { kind: "villager", seed: "villager-1", x: 6, z: -6.5, rot: -2.4 },
  { kind: "dog", seed: "dog-1", x: 4.6, z: -7.6, rot: 0.6 },
  { kind: "villager", seed: "villager-2", x: -7, z: 2.5, rot: 1.9 },
  { kind: "villager", seed: "villager-3", x: 14.5, z: -7.5, rot: -1.1 },
  { kind: "cat", seed: "cat-1", x: 7.6, z: 8.3, y: 1, rot: -2.3 },
  { kind: "bird", seed: "bird-1", x: 12.2, z: 0, y: 4.5, rot: Math.PI },
  { kind: "bird", seed: "bird-2", x: -12.2, z: 0, y: 4.5, rot: 0 },
  { kind: "rabbit", seed: "rabbit-1", x: 29, z: 13, rot: 2.5 },
  { kind: "owl", seed: "owl-1", x: 26, z: 18, y: 11, rot: -2.5 },
];

/**
 * Generated props placed as decor (IMPL-0010, PROPOSTA; final layout is PEN-017). Copies of one entry share
 * the seed, so they are drawn as one instanced model. Faces the plaza unless `rot` says otherwise.
 * Kept clear of lots (ring 22), the street (13–17), gifts, the pond and the sleigh.
 */
export interface PropPlacement {
  kind: "market-stall" | "panettone-stand" | "lantern" | "fence" | "mailbox" | "signpost" | "sled";
  seed: string;
  /** Collision radius (0 = walk-through). */
  r: number;
  at: Array<{ x: number; z: number; rot?: number }>;
}

const facePlaza = (x: number, z: number) => ({ x, z, rot: Math.atan2(-x, -z) });

export const PLACED_PROPS: PropPlacement[] = [
  // Christmas market at the west edge, between two lots.
  { kind: "market-stall", seed: "market-west", r: 1, at: [facePlaza(-20.5, -2.4)] },
  { kind: "panettone-stand", seed: "panettone-west", r: 1, at: [facePlaza(-20.5, 2.4)] },
  { kind: "fence", seed: "market-fence", r: 0, at: [{ x: -23, z: -2.4, rot: Math.PI / 2 }, { x: -23, z: 2.4, rot: Math.PI / 2 }] },
  { kind: "market-stall", seed: "market-east", r: 1, at: [facePlaza(20.5, 0)] },
  // Lanterns between the street and the lots.
  { kind: "lantern", seed: "ring-lantern", r: 0.3, at: [45, 135, 225, 315].map((d) => facePlaza(18.6 * Math.cos((d * Math.PI) / 180), 18.6 * Math.sin((d * Math.PI) / 180))) },
  // Welcome corner by the spawn.
  { kind: "signpost", seed: "welcome-sign", r: 0.3, at: [{ x: -2.4, z: 12.6, rot: 0 }] },
  { kind: "mailbox", seed: "village-mail", r: 0.35, at: [{ x: 2.4, z: 12.6, rot: Math.PI }] },
  { kind: "sled", seed: "kids-sled", r: 0.7, at: [{ x: 2.5, z: 27, rot: 0.4 }] },
];

export const LAMPS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (2 * Math.PI * i) / 8;
  return [Math.round(12.2 * Math.cos(a) * 100) / 100, Math.round(12.2 * Math.sin(a) * 100) / 100];
});

export const SPAWN = { x: 0, z: 9 } as const;

/** Ids of the fictional quest NPCs (PROPOSTA quests-v1, PEN-025); `NpcId` is derived from this list. */
export const NPC_IDS = ["sleigh-keeper", "market-keeper", "postmaster", "pond-keeper", "storyteller"] as const;
export type NpcId = (typeof NPC_IDS)[number];

/**
 * Fictional quest NPCs (PROPOSTA quests-v1, PEN-025). Seed = npc_id, so every visitor sees the same
 * villager. Positions are suggestions (final layout: PEN-017/PEN-023); while quests are on they block the
 * avatar like the decorative villagers (see QUEST_OBSTACLES). `rot` faces the approach from the plaza.
 */
export interface NpcPlacement {
  id: NpcId;
  name: string;
  role: string;
  seed: string;
  x: number;
  z: number;
  rot: number;
}

export const NPCS: NpcPlacement[] = [
  { id: "sleigh-keeper", name: "Baltazar", role: "Guardião do trenó do Noel", seed: "sleigh-keeper", x: -2.5, z: 28.5, rot: Math.atan2(2.5, -28.5) },
  { id: "market-keeper", name: "Dona Filó", role: "Mercadora do mercado oeste", seed: "market-keeper", x: -18.6, z: 0, rot: Math.atan2(18.6, 0) },
  { id: "postmaster", name: "Seu Nivaldo", role: "Carteiro da Vila", seed: "postmaster", x: 4.5, z: 11.8, rot: Math.atan2(-4.5, -11.8) },
  { id: "pond-keeper", name: "Aurora", role: "Vigia do lago congelado", seed: "pond-keeper", x: 24.5, z: -2.5, rot: Math.atan2(-24.5, 2.5) },
  { id: "storyteller", name: "Dona Guida", role: "Contadora de histórias", seed: "storyteller", x: 5, z: 4, rot: Math.atan2(-5, -4) },
];

/** Collectible quest items (PROPOSTA quests-v1): proximity pickup, no collider. */
export interface QuestSpawn {
  id: string;
  questId: string;
  objectId: string;
  x: number;
  z: number;
}

export const QUEST_SPAWNS: QuestSpawn[] = [
  { id: "bell-pine-north", questId: "harness-bells", objectId: "reindeer-bell", x: -10, z: -12.4 },
  { id: "bell-pine-east", questId: "harness-bells", objectId: "reindeer-bell", x: 12.2, z: 9.5 },
  { id: "crate-street", questId: "ornament-crates", objectId: "ornament-crate", x: -14.5, z: 8.6 },
  { id: "crate-market", questId: "ornament-crates", objectId: "ornament-crate", x: -16.8, z: -3.6 },
  { id: "lantern-lake-1", questId: "lake-lanterns", objectId: "lake-lantern", x: 23.5, z: 17 },
  { id: "lantern-lake-2", questId: "lake-lanterns", objectId: "lake-lantern", x: 30.5, z: 10 },
];

/** Existing props that become interaction points for a quest (PROPOSTA quests-v1). */
export interface QuestInteraction {
  id: string;
  questId: string;
  objectId: string;
  x: number;
  z: number;
  radius: number;
}

export const QUEST_INTERACTIONS: QuestInteraction[] = [
  { id: "mailbox-open", questId: "frozen-mailbox", objectId: "village-mailbox", x: 2.4, z: 12.6, radius: 3.5 },
  { id: "sled-ride", questId: "kids-sled-run", objectId: "kids-sled", x: 2.5, z: 27, radius: 3.5 },
];

/**
 * Reading lectern next to the tree (PROPOSTA quests-v1): a second way into the global donation panel
 * (DEC-026), used by `donation-promise-reading`. Exists only while quests are on, like the NPCs.
 */
export const DONATION_PANEL = { x: 4.6, z: 6.4, rot: Math.atan2(SPAWN.x - 4.6, SPAWN.z - 6.4), r: 0.5 } as const;

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

/** Circle obstacle on the ground plane (avatar collision). */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

/**
 * Static obstacles inside the walkable area: pines (trunk + lower boughs), lamp posts, benches,
 * snowmen, the sleigh and its reindeer. The tree and the world edge are handled by `clampToWorld`.
 * Pines block at their lower boughs' core (art reaches 2–3 u at the base, thinning upwards), so the
 * avatar may brush into the outer needles but never walks through a trunk.
 */
export const OBSTACLES: Obstacle[] = [
  // The tree: same keep-out as clampToWorld (avatar radius 0.45), but with sliding.
  { x: 0, z: 0, r: TREE_RADIUS - 0.45 },
  ...PINES.filter(([x, z]) => Math.hypot(x, z) < WORLD_RADIUS + 1).map(([x, z]) => ({ x: Math.round(x), z: Math.round(z), r: 1.6 })),
  ...LAMPS.map(([x, z]) => ({ x, z, r: 0.3 })),
  ...LAMPS.filter((_, i) => i % 2 === 1).map(([x, z]) => ({ x: x * 0.92, z: z * 0.92, r: 0.6 })),
  ...SNOWMEN.map(([x, z]) => ({ x, z, r: 0.85 })),
  { x: SLEIGH.x - 0.6, z: SLEIGH.z, r: 1.2 },
  { x: SLEIGH.x + 1.2, z: SLEIGH.z, r: 1.1 },
  { x: SLEIGH.x + 4.8, z: SLEIGH.z - 0.9, r: 0.8 },
  { x: SLEIGH.x + 7.8, z: SLEIGH.z + 0.9, r: 0.8 },
  ...PLACED_PROPS.filter((p) => p.r > 0).flatMap((p) => p.at.map(({ x, z }) => ({ x, z, r: p.r }))),
  ...CRITTERS.filter((c) => !c.y && (c.kind === "villager" || c.kind === "dog")).map((c) => ({ x: c.x, z: c.z, r: c.kind === "villager" ? 0.5 : 0.4 })),
];

/**
 * Obstacles that exist only while quests are on (PROPOSTA quests-v1): the quest NPCs, at the decorative
 * villager radius, and the donation lectern. Kept out of OBSTACLES so that, with quests off, nothing
 * invisible blocks the avatar; the client adds them to its colliders together with the meshes.
 */
export const QUEST_OBSTACLES: Obstacle[] = [
  ...NPCS.map((n) => ({ x: n.x, z: n.z, r: 0.5 })),
  { x: DONATION_PANEL.x, z: DONATION_PANEL.z, r: DONATION_PANEL.r },
];

/** Chalet footprint of a published lot (walls ±2.5, eaves ±3.5): close enough to still interact. */
export const HOUSE_RADIUS = 3;

export type Surface = "stone" | "packed" | "snow" | "ice";

/** Ground material under a point (footstep sound, snow kick-up). Mirrors the ground layout. */
export function surfaceAt(x: number, z: number): Surface {
  if (Math.hypot(x - POND.x, z - POND.z) <= POND.radius) return "ice";
  const r = Math.hypot(x, z);
  if (r <= PLAZA_RADIUS) return "stone";
  if (r >= STREET_INNER && r <= STREET_OUTER) return "packed";
  return "snow";
}
