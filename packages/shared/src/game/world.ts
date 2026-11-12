/**
 * World layout (first-slice proposal; final layout is PEN-017/PEN-023).
 * Unit = 1 voxel. The plaza is centred on the origin; the tree marks the global
 * donation point (example from P01, not a decision).
 */
import { AVATAR_RADIUS, type Collider, footprint, type Placed } from "./collision";

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
/** Interaction anchor of the tree: the tree is "near" within `TREE_RADIUS + INTERACT_DISTANCE` of its axis. */
export const TREE_RADIUS = 3.5;
/** Reach of the tree's lowest boughs (drawn 2 u above the ground): what blocks the avatar (IMPL-0016). */
export const TREE_BOUGHS_RADIUS = 4.5;
/** Closest the avatar's centre gets to the tree's axis. */
export const TREE_KEEP_OUT = TREE_BOUGHS_RADIUS + AVATAR_RADIUS;
export const INTERACT_DISTANCE = 4.5;
/**
 * Reach of a lot, from its centre. Larger than `INTERACT_DISTANCE` because a chalet's porch ends 4.5 u from
 * the centre, so the avatar stands almost 5 u away at the front door (IMPL-0016). Lots are 16.8 u apart.
 */
export const LOT_INTERACT_DISTANCE = 6;

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
/** Pine size by index: the three by the plaza stay small so they never hide the avatar from the camera. */
export const pineIsTall = (i: number): boolean => i >= 3 && i % 3 !== 0;
/** Where a pine stands: the drawn model and its collider both snap to whole voxels. */
export const pineAt = ([x, z]: readonly [number, number]): Placed => ({ x: Math.round(x), z: Math.round(z) });

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
/** The two harnessed reindeer in front of the sleigh, facing +x. */
export const REINDEER: Placed[] = [0, 1].map((i) => ({ x: SLEIGH.x + 4.8 + i * 3, z: SLEIGH.z + (i ? 0.9 : -0.9) }));

/**
 * Solid part of a drawn model, in model-local world units: `[x0, x1, z0, z1, corner radius]`, i.e. the
 * rectangle that blocks the avatar, measured from the voxels below head height (IMPL-0016). It turns with
 * each copy of the model. `apps/client/src/scene/colliders.test.ts` checks it against the drawn voxels.
 */
export type Solid = readonly [x0: number, x1: number, z0: number, z1: number, r: number];
const solid = (at: Placed, [x0, x1, z0, z1, r]: Solid): Collider => footprint(at, x0, x1, z0, z1, r);

/**
 * Generated villagers and animals placed as decor (IMPL-0010, PROPOSTA; final layout is PEN-017).
 * `kind` = generator id, `seed` fixes the variant for every visitor. `y` lifts perched animals.
 * Those within the avatar's height block it (see OBSTACLES); none affects missions or XP.
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

/** Villagers face +z: arms across x, coat two voxels deep. Shared by decor villagers and quest NPCs. */
const VILLAGER_SOLID: Solid = [-0.75, 0.75, -0.45, 0.45, 0.45];
/** Animals face +x. Birds and owls are too small to block anyone. */
const CRITTER_SOLID: Record<Critter["kind"], Solid | null> = {
  villager: VILLAGER_SOLID,
  dog: [-0.95, 1.4, -0.4, 0.4, 0.4],
  cat: [-0.63, 0.81, -0.27, 0.27, 0.27],
  rabbit: [-0.49, 0.63, -0.35, 0.35, 0.35],
  bird: null,
  owl: null,
};
/** Anything standing higher than this is over the avatar's head and never blocks it. */
const HEAD_HEIGHT = 2.2;

/**
 * Generated props placed as decor (IMPL-0010, PROPOSTA; final layout is PEN-017). Copies of one entry share
 * the seed, so they are drawn as one instanced model. Faces the plaza unless `rot` says otherwise.
 * Kept clear of lots (ring 22), the street (13–17), gifts, the pond and the sleigh.
 */
export interface PropPlacement {
  kind: "market-stall" | "panettone-stand" | "lantern" | "fence" | "mailbox" | "signpost" | "sled";
  seed: string;
  /** What blocks the avatar, per copy. Depends on the seed (e.g. the stall width), so it sits next to it. */
  solid: Solid;
  at: Array<{ x: number; z: number; rot?: number }>;
}

const facePlaza = (x: number, z: number) => ({ x, z, rot: Math.atan2(-x, -z) });

export const PLACED_PROPS: PropPlacement[] = [
  // Christmas market at the west edge, between two lots.
  // Stalls: counter plus the awning's front lip, which hangs at chest height (front = local +z).
  { kind: "market-stall", seed: "market-west", solid: [-1.47, 1.47, -0.63, 1.05, 0.2], at: [facePlaza(-20.5, -2.4)] },
  { kind: "panettone-stand", seed: "panettone-west", solid: [-1.89, 1.89, -0.63, 1.05, 0.2], at: [facePlaza(-20.5, 2.4)] },
  { kind: "fence", seed: "market-fence", solid: [-1.13, 1.13, -0.13, 0.13, 0.13], at: [{ x: -23, z: -2.4, rot: Math.PI / 2 }, { x: -23, z: 2.4, rot: Math.PI / 2 }] },
  { kind: "market-stall", seed: "market-east", solid: [-1.47, 1.47, -0.63, 1.05, 0.2], at: [facePlaza(20.5, 0)] },
  // Lanterns between the street and the lots.
  { kind: "lantern", seed: "ring-lantern", solid: [-0.45, 0.45, -0.45, 0.45, 0.45], at: [45, 135, 225, 315].map((d) => facePlaza(18.6 * Math.cos((d * Math.PI) / 180), 18.6 * Math.sin((d * Math.PI) / 180))) },
  // Welcome corner by the spawn. The signpost's lowest board points along local +z at chest height.
  { kind: "signpost", seed: "welcome-sign", solid: [-0.2, 0.2, -0.2, 0.86, 0.2], at: [{ x: -2.4, z: 12.6, rot: 0 }] },
  { kind: "mailbox", seed: "village-mail", solid: [-0.3, 0.45, -0.5, 0.6, 0.3], at: [{ x: 2.4, z: 12.6, rot: Math.PI }] },
  { kind: "sled", seed: "kids-sled", solid: [-0.77, 1.21, -0.33, 0.33, 0.3], at: [{ x: 2.5, z: 27, rot: 0.4 }] },
];

export const LAMPS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (2 * Math.PI * i) / 8;
  return [Math.round(12.2 * Math.cos(a) * 100) / 100, Math.round(12.2 * Math.sin(a) * 100) / 100];
});

/** Benches on the plaza side of every other lamp post, lengthwise along the ring. */
export const BENCHES: Required<Placed>[] = LAMPS.filter((_, i) => i % 2 === 1).map(([x, z]) => ({ x: x * 0.92, z: z * 0.92, rot: Math.atan2(x, z) }));

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

/**
 * Collectible quest items (PROPOSTA quests-v1): proximity pickup, no collider. Each sits on free ground,
 * clear of every collider (the two bells and the first lantern moved out from under the pines' boughs when
 * the pine colliders grew to the drawn boughs, IMPL-0016; ids unchanged).
 */
export interface QuestSpawn {
  id: string;
  questId: string;
  objectId: string;
  x: number;
  z: number;
}

export const QUEST_SPAWNS: QuestSpawn[] = [
  { id: "bell-pine-north", questId: "harness-bells", objectId: "reindeer-bell", x: -10, z: -13.2 },
  { id: "bell-pine-east", questId: "harness-bells", objectId: "reindeer-bell", x: 12.9, z: 9.2 },
  { id: "crate-street", questId: "ornament-crates", objectId: "ornament-crate", x: -14.5, z: 8.6 },
  { id: "crate-market", questId: "ornament-crates", objectId: "ornament-crate", x: -16.8, z: -3.6 },
  { id: "lantern-lake-1", questId: "lake-lanterns", objectId: "lake-lantern", x: 23.2, z: 17 },
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

/** Keeps the avatar inside the world and outside the tree's boughs. */
export function clampToWorld(x: number, z: number): [number, number] {
  let r = Math.hypot(x, z);
  if (r > WORLD_RADIUS) {
    x = (x / r) * WORLD_RADIUS;
    z = (z / r) * WORLD_RADIUS;
    r = WORLD_RADIUS;
  }
  if (r < TREE_KEEP_OUT) {
    const k = r === 0 ? 1 : TREE_KEEP_OUT / r;
    x = r === 0 ? TREE_KEEP_OUT : x * k;
    z = z * k;
  }
  return [x, z];
}

/** Something solid on the ground plane that blocks the avatar: a circle or a rounded rectangle. */
export type Obstacle = Collider;

/**
 * Static obstacles inside the walkable area (IMPL-0016): one entry per solid thing that is drawn, sized
 * from its voxels below head height, so nothing solid is walk-through and nothing invisible blocks. The
 * world edge is handled by `clampToWorld`; lots are added by the client (`lotColliders`), quest NPCs and
 * the lectern by `QUEST_OBSTACLES`. Gifts, quest items, the pond and perched birds are walkable on purpose.
 *
 * The tree and the pines block at their lowest boughs, minus a brush of 0.3 u: the avatar touches the
 * outer needles but never stands inside the foliage. Small pines carry boughs from knee height, tall ones
 * and the tree from 2 u up (head height).
 */
export const OBSTACLES: Obstacle[] = [
  { x: 0, z: 0, r: TREE_BOUGHS_RADIUS },
  ...PINES.map((p, i) => ({ ...pineAt(p), r: pineIsTall(i) ? 3.2 : 2.2 })).filter((p) => Math.hypot(p.x, p.z) < WORLD_RADIUS + 1),
  // Lamp posts: the pole plus the wreath that hangs on its +z side at chest height.
  ...LAMPS.map(([x, z]) => ({ x, z: z + 0.2, r: 0.55 })),
  ...BENCHES.map((b) => solid(b, [-0.75, 0.75, -0.25, 0.25, 0.25])),
  ...SNOWMEN.map(([x, z]) => ({ x, z, r: 0.85 })),
  solid(SLEIGH, [-1.75, 2.75, -1.25, 1.25, 0.25]),
  // Reindeer: legs, body and tail; the neck and head are above the avatar.
  ...REINDEER.map((d) => solid(d, [-1.4, 1.3, -0.52, 0.52, 0.5])),
  ...PLACED_PROPS.flatMap((p) => p.at.map((at) => solid(at, p.solid))),
  ...CRITTERS.flatMap((c) => {
    const s = CRITTER_SOLID[c.kind];
    return s && (c.y ?? 0) < HEAD_HEIGHT ? [solid(c, s)] : [];
  }),
];

/**
 * Obstacles that exist only while quests are on (PROPOSTA quests-v1): the quest NPCs, with the decorative
 * villagers' footprint, and the donation lectern. Kept out of OBSTACLES so that, with quests off, nothing
 * invisible blocks the avatar; the client adds them to its colliders together with the meshes.
 */
export const QUEST_OBSTACLES: Obstacle[] = [
  ...NPCS.map((n) => solid(n, VILLAGER_SOLID)),
  { x: DONATION_PANEL.x, z: DONATION_PANEL.z, r: DONATION_PANEL.r },
];

/** Rectangle in lot-local world units (`[x0, x1, z0, z1]`; the lot faces the plaza along local +z). */
export type Rect = readonly [x0: number, x1: number, z0: number, z1: number];

/**
 * Envelope of every generated chalet: walls up to ±3.5 and a porch that ends 4.5 u in front of the lot
 * centre. The client blocks the avatar with the real footprint of each house (`GenModel.solid`); this is
 * the worst case, used when the house model is not at hand (tests in this package).
 */
export const HOUSE_ENVELOPE: readonly Rect[] = [[-3.5, 3.5, -3.5, 3.5], [-2.5, 2.5, 3.5, 4.5]];

/**
 * Colliders of one lot: the chalet's walls and porch when an NGO is published (`house` = its footprint),
 * otherwise the "available" marker (four corner posts and the sign). The pad itself is walkable.
 */
export function lotColliders(lot: LotDef, house: readonly Rect[] | null): Obstacle[] {
  const at = { x: lot.x, z: lot.z, rot: lot.facing };
  if (house) return house.map(([x0, x1, z0, z1]) => footprint(at, x0, x1, z0, z1));
  return [
    ...[[-3, -3], [3, -3], [-3, 3], [3, 3]].map(([x, z]) => footprint(at, x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0.5)),
    footprint(at, -1.5, 1.5, 1.5, 2.5, 0.5),
  ];
}

/** Old circle around a chalet. Unused once the client blocks with `lotColliders`; removed with its last use. */
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
