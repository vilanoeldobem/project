/**
 * World layout (PROPOSTA, IMPL-0024; the final layout is PEN-017/PEN-023).
 * Unit = 1 voxel. The square is centred on the origin; the tree marks the global donation point (example
 * from P01, not a decision) and stays the centre of the village: every avenue is a clear view of it.
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
  // Ground of the thawed village (IMPL-0030, PROPOSAL): snow is an accent, and the streets are the darkest thing
  // on the ground. Every road tone keeps a contrast of at least 3:1 against every yard tone (lawn, lawnDark,
  // snow, snowShade); `apps/client/src/scene/groundRuns.test.ts` checks it.
  asphalt: "#4A4E57",
  asphaltDark: "#3E424B",
  cobble: "#5A5650",
  cobbleDark: "#4B4843",
  brick: "#6A4F43",
  brickDark: "#5A4238",
  earthRoad: "#5C5046",
  kerb: "#D9D4C8",
  paver: "#B9A994",
  paverDark: "#A6957F",
  gravel: "#CBB99A",
  lawn: "#A9BFA0",
  lawnDark: "#9AB392",
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

/** Interaction anchor of the tree: the tree is "near" within `TREE_RADIUS + INTERACT_DISTANCE` of its axis. */
export const TREE_RADIUS = 3.5;
/** Reach of the tree's lowest boughs (drawn 2 u above the ground): what blocks the avatar (IMPL-0016). */
export const TREE_BOUGHS_RADIUS = 4.5;
/** Closest the avatar's centre gets to the tree's axis. */
export const TREE_KEEP_OUT = TREE_BOUGHS_RADIUS + AVATAR_RADIUS;
export const INTERACT_DISTANCE = 4.5;
/**
 * Reach of a lot, from its centre. Larger than `INTERACT_DISTANCE` because a chalet's porch ends 4.5 u from
 * the centre, so the avatar stands almost 5 u away at the front door (IMPL-0016). Neighbouring lots are 10 u
 * apart, so two of them can be in reach at once: the nearest one wins.
 */
export const LOT_INTERACT_DISTANCE = 6;
/** Reach of a residential plot, a shop door or a billboard, from its interaction point. */
export const PLACE_INTERACT_DISTANCE = 3.2;

// ---------------------------------------------------------------------------------------------------------
// Village plan (IMPL-0024 and IMPL-0031, PROPOSTA; the final plan is PEN-017/PEN-023).
//
// The village is a wheel around the Christmas tree: `sides` avenues leave the square between the sides of a
// polygon, and every ring is a row of parcels along each side, facing the tree. A lane (pedestrian path) runs
// down the middle of every side, so each side holds two half rows. From the centre out: the square (plaza,
// ring street, festive band), the square's frontage (plots reserved for approved NGOs, DEC-028, and the
// Christmas shops) and the rings of `VILLAGE_PLAN.rings`, one street each.
//
// A ring is zoned by half row (IMPL-0031): each of its `2 × sides` half rows is lots for NGOs, houses, a civic
// building, a park or a small square. About four parcels in five are NGO lots. Growing the village is adding a
// ring to the list: the rings before it, their lots and their ids do not move.
//
// What follows the plan, and what does not:
//
// - `layoutVillage(plan)` derives the rings, the lots, the shops, the residential plots, the civic buildings,
//   the parks and squares, the display boards, the street graph and the world radius. The belt of tall pines,
//   the street lamps, the lane lanterns, the wood yard, the dressing of the rows, the ground and the navigation
//   grid follow the plan in force (`VILLAGE`).
// - The scenery of the square is placed by hand for the plan in force: 8 avenues, a square of 26 u, a shop
//   every two sides. The plaza lamps and benches, the three small pines, the market, the sleigh, the pond,
//   the snowmen, the reindeer pens, the quest NPCs, the quest items and the gifts do not move with the plan;
//   nor do the spots of the village's characters (`life.ts`, IMPL-0025), whose tests say when one no longer fits
//   (their homes are houses: the half rows they live in must stay residential).
//
// So the knobs are of two kinds:
//
// - safe to turn (nothing by hand is in their way; the tests of the layout and of the walk check the result):
//   a ring's `perHalf`, `width`, `depth` and `zoning`, a new ring at the end of the list, a tier's `house`,
//   `streetWidth`, `backYard` and `edge`;
// - turn only with the scenery of the square reviewed: `sides` (`assertPlan` refuses any other number: an
//   avenue would run over what stands in the square), `plazaRadius`, `ringStreet`, `squareApothem`,
//   `avenueWidth`, `laneWidth`, `frontage` and `shopEvery`.
//
// Ids are positional (`plaza-NN`, `ring1-NN`, `shop-NN`, `<tier>-NN`, `civic-NN`: the n-th place of its kind
// counted around the village, ring by ring), so they are stable only for an unchanged plan: another
// `shopEvery`, `frontage.perHalf`, ring `perHalf` or `zoning` renumbers or moves lots and plots, including the
// ones stored in D1 (`lots.id`, `ngos.requested_lot_id`, `progress_events`, quest objectives,
// `ngo_withdrawals.lot_ids`, audit details, `residential_plots.id`). Migrations 0012 and 0015 seed them:
// changing the plan needs a new migration that moves or renames those rows; `village.test.ts` pins the ids to
// their places and says so when it fails. A ring appended to the list only adds rows.
// ---------------------------------------------------------------------------------------------------------

/**
 * Residential tiers, nearest the square first. Ownership is off (`RESIDENTIAL_PLOTS_ENABLED`, OQ-17). These
 * three words are internal ids (code, ids of plots, the `tier` column): the UI never shows them, because they
 * read as price classes and nothing here has a price. On screen a tier is a neighbourhood (`TierPlan.label`).
 */
export type PlotTier = "premium" | "standard" | "economy";
export const PLOT_TIERS: readonly PlotTier[] = ["premium", "standard", "economy"];

/**
 * What holding a plot of a tier would ask of a player (PROPOSTA, OQ-17): unlocked by playing, never bought.
 * There is no price, currency or purchase anywhere in the village (DEC-042, IMPL-0002). Whether players may
 * hold a plot at all is undecided, so the UI shows a requirement only while the flag is on (it is off), and
 * says so when no open mission reaches the level asked (`attainableLevel`, `progress.ts`).
 */
export type TierRequirement = { kind: "level"; level: number };

/** Chalet of a tier: fixed footprint (so rows line up and colliders are exact), in voxels around its centre. */
export interface HousePlan {
  /** Half extents of the walls in voxels (the walls span `2 n + 1` u). */
  halfWidth: number;
  halfDepth: number;
  /** Chance of a front porch (0 = never). */
  porch: number;
  /** Roof overhangs the side walls by one voxel. */
  eaves: boolean;
  /** Where the chalet's centre sits in the plot, along the plot's depth axis (0 = middle, negative = back). */
  offset: number;
}

export interface TierPlan {
  /** pt-BR name of the tier's neighbourhood, as the UI shows it: a place, with no word that reads as a price class. */
  label: string;
  requirement: TierRequirement;
  house: HousePlan;
}

/** What a half row of a ring holds (IMPL-0031, PROPOSTA). */
export type RowUse = "ngo" | "residential" | "civic" | "park" | "square";
/** One letter per half row in a ring's `zoning`. */
export const ZONING_LETTERS: Record<string, RowUse> = { N: "ngo", R: "residential", C: "civic", P: "park", S: "square" };

/**
 * A ring of parcels behind its own street (IMPL-0031, PROPOSTA). Every half row of the ring is a grid of
 * `perHalf` parcels of `width` × `depth`; what stands on it is the letter of `zoning` for that half row.
 */
export interface RingPlan {
  /** Id of the ring: prefix of the ids of its NGO lots and the `street` of their rows in D1 (`ring1`, `ring2`…). */
  id: string;
  /** Tier of the houses of the ring and the paving of its street. */
  tier: PlotTier;
  /** Parcels on each half of a side. */
  perHalf: number;
  /** Parcel width along the street and depth away from it (multiples of 0.5 u). */
  width: number;
  depth: number;
  /**
   * Use of each half row, two letters per side from the east side counter-clockwise, the clockwise half first:
   * N = NGO lots, R = houses, C = a civic building (the next of `VillagePlan.civic`), P = a park, S = a square.
   */
  zoning: string;
}

/** Civic buildings of the village (IMPL-0031, PROPOSTA): scenery with a name, nothing is sold or served in them. */
export const CIVIC_KINDS = ["bank", "restaurant", "gym", "school", "cinema", "theatre", "supermarket", "hospital", "sleigh-station", "mall", "sports-hall"] as const;
export type CivicKind = (typeof CIVIC_KINDS)[number];

export interface VillagePlan {
  /** Avenues, and sides of every ring. */
  sides: number;
  plazaRadius: number;
  /** The round street around the plaza. */
  ringStreet: readonly [inner: number, outer: number];
  /** Closest the square's frontage gets to the tree (apothem of the line where its porches end). */
  squareApothem: number;
  avenueWidth: number;
  streetWidth: number;
  laneWidth: number;
  /** Ground between the back of a row and the street behind it. */
  backYard: number;
  /** The square's frontage: `perHalf` plots of `width` × `depth` on each half of a side. */
  frontage: { perHalf: number; width: number; depth: number };
  /** Every `shopEvery`-th side gives the first plot of its frontage to a shop (0 = no shops). Moves lot ids. */
  shopEvery: number;
  /** Walkable ground beyond the outermost corner. */
  edge: number;
  tiers: Record<PlotTier, TierPlan>;
  /** The rings behind the frontage, nearest the square first. An empty list is the square alone. */
  rings: RingPlan[];
  /** The civic building of each `C` of the zoning, in the order the letters come (ring by ring, around the village). */
  civic: CivicKind[];
}

/**
 * The plan in force (PROPOSTA). Requirements are placeholders for the product owner to set (OQ-17): levels
 * come only from missions and quests (DEC-042), and level 3 and above need the quests, which are off in
 * production today.
 *
 * Zoning (IMPL-0031): 97 NGO lots (12 on the frontage, 85 on the rings), 23 houses, 11 civic buildings, three
 * parks and two squares. The letters were arranged by hand, scattered around the village: no two civic
 * buildings side by side, houses and parks on every quarter, and the half rows where a character of the
 * village lives (`life.ts`) kept residential.
 */
export const VILLAGE_PLAN: VillagePlan = {
  sides: 8,
  plazaRadius: 12,
  ringStreet: [13, 17],
  squareApothem: 26,
  avenueWidth: 4,
  streetWidth: 4,
  laneWidth: 3,
  backYard: 1.5,
  frontage: { perHalf: 1, width: 7, depth: 8 },
  shopEvery: 2,
  edge: 2.5,
  tiers: {
    premium: { label: "Bairro do Centro", requirement: { kind: "level", level: 5 }, house: { halfWidth: 3, halfDepth: 3, porch: 1, eaves: true, offset: -1 } },
    standard: { label: "Bairro do Meio", requirement: { kind: "level", level: 3 }, house: { halfWidth: 3, halfDepth: 2, porch: 0.5, eaves: true, offset: -1 } },
    economy: { label: "Bairro da Floresta", requirement: { kind: "level", level: 2 }, house: { halfWidth: 2, halfDepth: 2, porch: 0, eaves: false, offset: -0.5 } },
  },
  rings: [
    //                                                          side: 0 1 2 3 4 5 6 7
    { id: "ring1", tier: "premium", perHalf: 1, width: 12, depth: 10, zoning: "RNCNRNNCRNSNRCRN" },
    { id: "ring2", tier: "standard", perHalf: 2, width: 9.5, depth: 8, zoning: "NRNCNNRNCRNNPNCN" },
    { id: "ring3", tier: "standard", perHalf: 3, width: 8, depth: 8, zoning: "NNCNNRNPNNCNNRNC" },
    { id: "ring4", tier: "economy", perHalf: 3, width: 10, depth: 9, zoning: "NSNNRNCNNPNNCRNN" },
  ],
  civic: ["bank", "restaurant", "gym", "school", "cinema", "theatre", "supermarket", "hospital", "sleigh-station", "mall", "sports-hall"],
};

export interface LotDef {
  id: string;
  /** Where the lot stands: `plaza` (the square's frontage) or the id of its ring. The `street` of its row in D1. */
  street: string;
  /** 1-based position among the lots of its street: `<street>-<slot>` is the id. */
  slot: number;
  /** The number people read on screen ("Terreno 27"): 1-based among every lot, the square first, then ring by ring. */
  number: number;
  x: number;
  z: number;
  /** Rotation (rad) so the lot faces the tree across its street. */
  facing: number;
}

/** A Christmas shop on the square's frontage (PROPOSTA): a real building, closed (no catalogue; nothing is sold). */
export interface ShopDef {
  id: string;
  x: number;
  z: number;
  facing: number;
  /** Where the avatar stands to use the shop: in front of its door. */
  door: { x: number; z: number };
  /** Where the shop's keeper stands during the shop's hours (IMPL-0025, `life.ts`): beside the door, facing the square. */
  keeper: { x: number; z: number; rot: number };
}

/**
 * Formats of the display boards of the village (IMPL-0031, PROPOSTA). Every board shows a notice of the village
 * today; the size of the artwork each one takes is fixed here so that artwork can be produced for them, but
 * whether a board may ever show anything else is not decided (PEN-008, OQ-18).
 *
 * `width` × `height`: the panel in world units. `art`: the artwork to deliver, in pixels, at the panel's
 * proportions. `cell`: its cell in the one atlas the game draws every board from (a quarter of the artwork each
 * way, a fifth for a screen, which holds `SCREEN_SLIDES` cells): on screen a board is never larger than its cell.
 */
export type BoardFormat = "rooftop" | "outdoor" | "lawn" | "screen";
export const BOARD_FORMATS: Record<BoardFormat, { width: number; height: number; art: readonly [number, number]; cell: readonly [number, number] }> = {
  rooftop: { width: 5, height: 2, art: [1280, 512], cell: [320, 128] },
  outdoor: { width: 8, height: 4, art: [2048, 1024], cell: [512, 256] },
  lawn: { width: 2, height: 1.5, art: [512, 384], cell: [128, 96] },
  screen: { width: 8, height: 4.5, art: [1920, 1080], cell: [384, 216] },
};

/** A display board (PROPOSTA): shows a notice of the village; not for rent (PEN-008, OQ-18). */
export interface BillboardDef {
  id: string;
  format: BoardFormat;
  /** The shop whose roof a `rooftop` board stands on. */
  shopId?: string;
  /** The park, square or civic building a board belongs to. */
  siteId?: string;
  /** Stands on the ground, on posts: it has a collider (`BOARD_SOLID`). The others stand on a roof. */
  grounded: boolean;
  /** Centre of the panel. A board always faces +z, towards the camera. */
  x: number;
  y: number;
  z: number;
  /** Where the avatar stands to read it. */
  point: { x: number; z: number };
}

/** A residential plot (PROPOSTA, OQ-17). Mirrors a `residential_plots` row (migrations 0012 and 0015). */
export interface ResidentialPlot {
  id: string;
  tier: PlotTier;
  /** The ring the plot stands on. */
  ring: string;
  /** 1-based position inside the tier, ring by ring, counter-clockwise from the east side. */
  slot: number;
  /** Centre of the plot. */
  x: number;
  z: number;
  /** Rotation (rad): the plot's local +z points at the street in front of it, towards the tree. */
  facing: number;
  width: number;
  depth: number;
  /** Where the avatar stands to read the plot: on the street, `PLOT_FRONT_STEP` from the middle of the plot's front edge. */
  front: { x: number; z: number };
  /** Centre of the chalet drawn on the plot. */
  house: { x: number; z: number };
  /** Fireplace spot inside the chalet's footprint, for a later phase (nothing is drawn there yet). */
  hearth: { x: number; z: number };
}

/** A row of residential plots: one half of a side of a ring. */
export interface RowDef {
  tier: PlotTier;
  ring: string;
  side: number;
  /** -1 = clockwise of the lane, +1 = counter-clockwise. */
  half: -1 | 1;
  /** Width and depth of each plot of the row. */
  width: number;
  depth: number;
  plots: ResidentialPlot[];
}

/** A row of NGO lots on a ring: one half of a side. */
export interface LotRowDef {
  ring: string;
  side: number;
  half: -1 | 1;
  /** Width of each lot along the street. */
  width: number;
  lots: LotDef[];
}

/**
 * A half row that is one place instead of parcels (IMPL-0031, PROPOSTA): a civic building, a park or a square.
 * Scenery with a name: nothing is sold, served or booked in any of them.
 */
export interface SiteDef {
  id: string;
  use: "civic" | "park" | "square";
  /** The building, for a civic site. */
  kind?: CivicKind;
  ring: string;
  side: number;
  half: -1 | 1;
  /** Centre of the half row. */
  x: number;
  z: number;
  facing: number;
  width: number;
  depth: number;
  /** Centre of the building (civic) or of the centrepiece (the bandstand of a park, the fountain of a square). */
  centre: { x: number; z: number };
  /** Where the avatar stands to read about it: on the street in front. */
  front: { x: number; z: number };
}

export type StreetKind = "plaza" | "avenue" | "street" | "lane";
export interface PathNode {
  id: string;
  x: number;
  z: number;
}
export interface PathEdge {
  a: string;
  b: string;
  kind: StreetKind;
  width: number;
  length: number;
}
/** The street network as a graph other systems can follow (walking villagers, deliveries, a mini-map). */
export interface PathGraph {
  nodes: PathNode[];
  edges: PathEdge[];
}

/** A ring of rows, as distances from the tree along a side's axis. */
export interface RingLayout {
  /** `frontage` (the square's own row) or the id of the ring in the plan. */
  id: string;
  /** Tier of the ring's houses and of its street's paving: null for the frontage. */
  tier: PlotTier | null;
  /** Street-side edge of the parcels and their far edge. */
  front: number;
  back: number;
  /** The street the ring faces: null for the frontage, which faces the square. */
  street: readonly [inner: number, outer: number] | null;
  /** Reach of a half row along the side, from the lane's axis. */
  reach: number;
  /** Parcels on each half row, and their size. */
  perHalf: number;
  width: number;
  depth: number;
  /** Use of each half row (`2 × side + (half === -1 ? 0 : 1)`); empty for the frontage. */
  uses: RowUse[];
}

export interface VillageLayout {
  plan: VillagePlan;
  worldRadius: number;
  rings: RingLayout[];
  lots: LotDef[];
  lotRows: LotRowDef[];
  shops: ShopDef[];
  billboards: BillboardDef[];
  rows: RowDef[];
  plots: ResidentialPlot[];
  sites: SiteDef[];
  graph: PathGraph;
}

/** How far into its street a plot's `front` point is, from the plot's edge. */
export const PLOT_FRONT_STEP = 0.75;
/** Height of the middle of a billboard frame: on the roof of a shop, above every head. */
export const SHOP_SIGN_HEIGHT = 8;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const upToHalf = (v: number) => Math.ceil(v * 2 - 1e-9) / 2;
/**
 * The number part of an id: two digits, or as many as the largest of `count` needs, so every id of a kind has
 * the same width (`economy-064`…`economy-112` in a plan with 112 plots; today's ids are unchanged).
 */
const numbered = (n: number, count: number) => String(n).padStart(Math.max(2, String(count).length), "0");

/** How many avenues the hand-placed scenery of the square is laid out for (see the note above `VILLAGE_PLAN`). */
export const SCENERY_SIDES = 8;

/** Rectangle in local world units (`[x0, x1, z0, z1]`; the front is local +z). */
export type Rect = readonly [x0: number, x1: number, z0: number, z1: number];

/**
 * What each civic building is (IMPL-0031, PROPOSTA). Names are the village's own: no real company, brand or
 * partner. `about` is what its panel says: what the building is, never a service, a price or an opening.
 *
 * `halfWidth` × `halfDepth`: half extents of the walls in voxels (the walls span `2 n + 1` u). `solid`: what
 * blocks the avatar, around the building's centre (front = local +z); `apps/client/src/scene/colliders.test.ts`
 * checks it against the drawn voxels. `screen`: the halls with a screen on the roof, and the height of that
 * roof (the generator's model ends there; a test keeps the two together).
 */
export interface CivicSpec {
  name: string;
  about: string;
  halfWidth: number;
  halfDepth: number;
  solid: readonly Rect[];
  screen?: number;
}
const hall = (hw: number, hd: number, portico = false): Rect[] => [[-hw - 0.5, hw + 0.5, -hd - 0.5, hd + 0.5], ...(portico ? [[-hw - 0.5, hw + 0.5, hd + 0.5, hd + 1.5] as Rect] : [])];
export const CIVIC: Record<CivicKind, CivicSpec> = {
  bank: { name: "Banco da Vila", about: "O prédio do banco, com colunas na frente.", halfWidth: 4, halfDepth: 3, solid: hall(4, 3, true) },
  restaurant: { name: "Cantina da Vila", about: "A cantina, com toldo listrado e chaminé.", halfWidth: 4, halfDepth: 3, solid: hall(4, 3) },
  gym: { name: "Academia da Vila", about: "A academia, com janelões para a rua.", halfWidth: 4, halfDepth: 3, solid: hall(4, 3) },
  school: { name: "Escola da Vila", about: "A escola, com o sino na torre.", halfWidth: 7, halfDepth: 2, solid: hall(7, 2) },
  cinema: { name: "Cine Vila", about: "O cinema, com a marquise iluminada.", halfWidth: 6, halfDepth: 2, solid: hall(6, 2), screen: 7 },
  theatre: { name: "Teatro da Vila", about: "O teatro, com colunas e frontão.", halfWidth: 6, halfDepth: 2, solid: hall(6, 2, true) },
  supermarket: { name: "Mercado da Vila", about: "O mercado, com a fachada de vitrines.", halfWidth: 9, halfDepth: 2, solid: hall(9, 2) },
  hospital: { name: "Hospital da Vila", about: "O hospital, de dois andares.", halfWidth: 9, halfDepth: 2, solid: hall(9, 2) },
  "sleigh-station": {
    name: "Posto do Trenó",
    about: "O posto dos trenós: feno para as renas, lanternas e um trenó estacionado. Na Vila tudo é a pé.",
    halfWidth: 6,
    halfDepth: 2,
    // A cabin at one end, the posts of the canopy, the hay and the parked sled: the avatar walks under the canopy.
    solid: [[-6.5, -2.5, -2.5, 0.5], [5.5, 6.5, -2.5, -1.5], [5.5, 6.5, 1.5, 2.5], [-6.5, -5.5, 1.5, 2.5], [0.5, 3.5, -2.5, -1.5], [-0.5, 3.5, 0.5, 1.5]],
  },
  mall: { name: "Galeria da Vila", about: "A galeria, com dois andares de vitrines.", halfWidth: 12, halfDepth: 3, solid: hall(12, 3), screen: 9 },
  "sports-hall": { name: "Ginásio da Vila", about: "O ginásio de esportes, com o telhado em arco.", halfWidth: 11, halfDepth: 3, solid: hall(11, 3), screen: 8 },
};
/** How far behind the street's edge the front wall of a civic building stands: room for steps or a portico. */
export const CIVIC_SETBACK = 1.5;

/** What blocks the avatar under a board that stands on the ground, around its centre (it never turns). */
export const BOARD_SOLID: Record<BoardFormat, readonly Solid[]> = {
  rooftop: [],
  // One mast in the middle: a board never turns with the row it stands on, and a mast fits whatever the row's angle.
  outdoor: [[-0.5, 0.5, -0.5, 0.5, 0.25]],
  lawn: [[-1.1, 1.1, -0.3, 0.3, 0.2]],
  screen: [[-0.5, 0.5, -0.5, 0.5, 0.25]],
};
/** Height of the middle of a board that stands on the ground. */
export const BOARD_HEIGHT: Record<BoardFormat, number> = { rooftop: SHOP_SIGN_HEIGHT, outdoor: 6, lawn: 1.75, screen: 6.25 };

/**
 * Refuses a plan the layout cannot draw, with a message that names the field, instead of a village full of
 * `NaN`. It checks the shape of the numbers, not the taste of the plan: whether a valid plan still has every
 * place reachable is what the tests of the plan in force check.
 */
export function assertPlan(plan: VillagePlan): void {
  const fail = (what: string): never => {
    throw new RangeError(`village plan: ${what}`);
  };
  const positive = (name: string, v: number) => void ((Number.isFinite(v) && v > 0) || fail(`${name} must be a positive number, got ${v}`));
  const atLeastZero = (name: string, v: number) => void ((Number.isFinite(v) && v >= 0) || fail(`${name} must be zero or more, got ${v}`));
  const count = (name: string, v: number) => void ((Number.isInteger(v) && v >= 0) || fail(`${name} must be a whole number, zero or more, got ${v}`));
  if (!Number.isInteger(plan.sides)) fail(`sides must be a whole number, got ${plan.sides}`);
  if (plan.sides !== SCENERY_SIDES) fail(`sides must be ${SCENERY_SIDES}, got ${plan.sides}: the scenery of the square (lamps, pines, market, sleigh, NPCs, quest items) is placed by hand for ${SCENERY_SIDES} avenues, review it first`);
  positive("plazaRadius", plan.plazaRadius);
  positive("ringStreet[0]", plan.ringStreet[0]);
  if (!(plan.ringStreet[0] >= plan.plazaRadius && plan.ringStreet[1] > plan.ringStreet[0])) fail(`ringStreet must lie outside the plaza, inner edge first, got [${plan.ringStreet.join(", ")}]`);
  if (!(Number.isFinite(plan.squareApothem) && plan.squareApothem > plan.ringStreet[1])) fail(`squareApothem must be beyond the round street (${plan.ringStreet[1]}), got ${plan.squareApothem}`);
  positive("avenueWidth", plan.avenueWidth);
  positive("streetWidth", plan.streetWidth);
  positive("laneWidth", plan.laneWidth);
  atLeastZero("backYard", plan.backYard);
  atLeastZero("edge", plan.edge);
  count("frontage.perHalf", plan.frontage.perHalf);
  count("shopEvery", plan.shopEvery);
  // A lot or a shop is a 7 × 7 pad with room for a porch 1 u in front of it.
  if (!(Number.isFinite(plan.frontage.width) && plan.frontage.width >= 7)) fail(`frontage.width must be at least 7 (the pad of a lot), got ${plan.frontage.width}`);
  if (!(Number.isFinite(plan.frontage.depth) && plan.frontage.depth >= 8)) fail(`frontage.depth must be at least 8 (the pad of a lot and its porch), got ${plan.frontage.depth}`);
  for (const tier of PLOT_TIERS) {
    const t = plan.tiers[tier];
    count(`tiers.${tier}.house.halfWidth`, t.house.halfWidth);
    count(`tiers.${tier}.house.halfDepth`, t.house.halfDepth);
    if (!(Number.isFinite(t.house.offset) && Number.isFinite(t.house.porch))) fail(`tiers.${tier}.house needs a number for offset and porch`);
    if (!(Number.isInteger(t.requirement.level) && t.requirement.level >= 1)) fail(`tiers.${tier}.requirement.level must be a whole number from 1, got ${t.requirement.level}`);
  }
  const seen = new Set<string>();
  let civic = 0;
  plan.rings.forEach((ring, i) => {
    const name = `rings[${i}]`;
    if (!/^ring\d+$/.test(ring.id)) fail(`${name}.id must be "ring" and a number, got "${ring.id}"`);
    if (seen.has(ring.id)) fail(`${name}.id "${ring.id}" is used twice`);
    seen.add(ring.id);
    if (!PLOT_TIERS.includes(ring.tier)) fail(`${name}.tier must be one of ${PLOT_TIERS.join(", ")}, got "${ring.tier}"`);
    if (!(Number.isInteger(ring.perHalf) && ring.perHalf >= 1)) fail(`${name}.perHalf must be a whole number from 1, got ${ring.perHalf}`);
    positive(`${name}.width`, ring.width);
    positive(`${name}.depth`, ring.depth);
    if (typeof ring.zoning !== "string" || ring.zoning.length !== 2 * plan.sides) fail(`${name}.zoning must have ${2 * plan.sides} letters (two per side), got ${JSON.stringify(ring.zoning)}`);
    for (const letter of ring.zoning) if (!(letter in ZONING_LETTERS)) fail(`${name}.zoning has the letter "${letter}": use N, R, C, P or S`);
    const site = ring.perHalf * ring.width;
    if (ring.zoning.includes("N")) {
      // A lot is a 7 × 7 pad with room for a porch 1 u in front of it, like the lots of the square.
      if (ring.width < 7) fail(`${name}.width must be at least 7 for NGO lots (the pad of a lot), got ${ring.width}`);
      if (ring.depth < 8) fail(`${name}.depth must be at least 8 for NGO lots (the pad of a lot and its porch), got ${ring.depth}`);
    }
    if (ring.zoning.includes("R")) {
      const house = plan.tiers[ring.tier].house;
      if (ring.width < 2 * house.halfWidth + 1) fail(`${name}.width must be at least ${2 * house.halfWidth + 1} for the ${ring.tier} house, got ${ring.width}`);
    }
    for (const letter of ring.zoning) {
      if (letter !== "C") continue;
      const kind = plan.civic[civic++];
      if (!CIVIC_KINDS.includes(kind)) fail(`civic[${civic - 1}] must name a civic building for a C of ${ring.id}, got ${JSON.stringify(kind)}`);
      const spec = CIVIC[kind];
      if (site < 2 * spec.halfWidth + 3) fail(`${ring.id} is too narrow for the ${kind} (half row ${site} u, building ${2 * spec.halfWidth + 1} u and its side yards)`);
      if (ring.depth < CIVIC_SETBACK + 2 * spec.halfDepth + 1) fail(`${ring.id} is too shallow for the ${kind} (depth ${ring.depth} u, building ${2 * spec.halfDepth + 1} u behind a setback of ${CIVIC_SETBACK} u)`);
    }
    if (ring.zoning.includes("P") || ring.zoning.includes("S")) {
      if (site < 12) fail(`${name} is too narrow for a park or a square (half row ${site} u, at least 12 u)`);
      if (ring.depth < 8) fail(`${name}.depth must be at least 8 for a park or a square, got ${ring.depth}`);
    }
  });
  if (civic !== plan.civic.length) fail(`civic lists ${plan.civic.length} building(s) and the zoning has ${civic} C`);
}

/** Frame of side `s`: outward axis `n`, tangent `t` (counter-clockwise) and the rotation that faces the tree. */
export function sideFrame(plan: VillagePlan, s: number) {
  const a = (2 * Math.PI * s) / plan.sides;
  const nx = Math.cos(a), nz = Math.sin(a);
  return { nx, nz, tx: -nz, tz: nx, facing: round4(Math.atan2(-nx, -nz)) };
}

/** Half of an avenue's width, measured along a side (the avenue crosses the side's line at an angle). */
const avenueCut = (plan: VillagePlan) => plan.avenueWidth / (2 * Math.cos(Math.PI / plan.sides));

/**
 * Derives the whole village from a plan: rings (each as close to the tree as the previous one and its own
 * row length allow), lots, shops, residential plots, civic buildings, parks, squares, display boards and the
 * street graph. Pure and deterministic.
 */
export function layoutVillage(plan: VillagePlan): VillageLayout {
  assertPlan(plan);
  const tan = Math.tan(Math.PI / plan.sides), cos = Math.cos(Math.PI / plan.sides);
  const cut = avenueCut(plan);
  /** Smallest apothem at which a half row of `reach` fits between the lane and the avenue. */
  const fits = (reach: number) => upToHalf((reach + cut) / tan);
  const at = (s: number, apothem: number, along: number) => {
    const f = sideFrame(plan, s);
    return { x: round2(apothem * f.nx + along * f.tx), z: round2(apothem * f.nz + along * f.tz) };
  };

  const rings: RingLayout[] = [];
  const frontageReach = plan.laneWidth / 2 + plan.frontage.perHalf * plan.frontage.width;
  let front = Math.max(upToHalf(plan.squareApothem), fits(frontageReach));
  rings.push({ id: "frontage", tier: null, front, back: front + plan.frontage.depth, street: null, reach: frontageReach, perHalf: plan.frontage.perHalf, width: plan.frontage.width, depth: plan.frontage.depth, uses: [] });
  for (const r of plan.rings) {
    const reach = plan.laneWidth / 2 + r.perHalf * r.width;
    const behind = rings[rings.length - 1].back + plan.backYard;
    front = Math.max(behind + plan.streetWidth, fits(reach));
    rings.push({ id: r.id, tier: r.tier, front, back: front + r.depth, street: [front - plan.streetWidth, front], reach, perHalf: r.perHalf, width: r.width, depth: r.depth, uses: [...r.zoning].map((letter) => ZONING_LETTERS[letter]) });
  }
  const last = rings[rings.length - 1];
  const worldRadius = upToHalf(Math.hypot(last.back, last.reach) + plan.edge);

  // Frontage: lots for NGOs (DEC-028) and the shops. The plot at the porch line holds a 7 × 7 pad whose
  // chalet may add a porch 1 u towards the square, so the pad's centre is 4.5 u behind the line.
  // Ids are positional: the n-th lot (or shop) in the order below. See the note above `VILLAGE_PLAN`.
  const frontage = rings[0];
  const lots: LotDef[] = [];
  const shops: ShopDef[] = [];
  const billboards: BillboardDef[] = [];
  const slots: Array<{ s: number; half: -1 | 1; i: number; shop: boolean }> = [];
  // The counter-clockwise halves first: the eight lots that already existed keep their ids there.
  for (const half of [1, -1] as const)
    for (let i = 0; i < plan.frontage.perHalf; i++)
      for (let s = 0; s < plan.sides; s++) slots.push({ s, half, i, shop: plan.shopEvery > 0 && s % plan.shopEvery === 0 && half === -1 && i === 0 });
  const shopCount = slots.filter((slot) => slot.shop).length, lotCount = slots.length - shopCount;
  for (const { s, half, i, shop: isShop } of slots) {
    const f = sideFrame(plan, s);
    const along = half * (plan.laneWidth / 2 + (i + 0.5) * plan.frontage.width);
    const centre = at(s, frontage.front + 4.5, along);
    if (!isShop) {
      lots.push({ id: `plaza-${numbered(lots.length + 1, lotCount)}`, street: "plaza", slot: lots.length + 1, number: lots.length + 1, ...centre, facing: f.facing });
      continue;
    }
    const id = `shop-${numbered(shops.length + 1, shopCount)}`;
    shops.push({
      id,
      ...centre,
      facing: f.facing,
      door: at(s, frontage.front - 0.5, along),
      keeper: { ...at(s, frontage.front - 0.2, along - 2.2), rot: f.facing },
    });
    billboards.push({ id: `billboard-${numbered(billboards.length + 1, shopCount)}`, format: "rooftop", shopId: id, grounded: false, x: centre.x, y: SHOP_SIGN_HEIGHT, z: centre.z, point: at(s, frontage.front - 0.5, along - 3.4) });
  }

  // The rings: every half row is lots, houses or one site, by the ring's zoning. Rows are packed from the lane
  // outwards, so what is left over is a verge beside the avenue. Ids are positional here too: the n-th lot of
  // the ring, the n-th plot of the tier, the n-th civic building, park or square, counter-clockwise from the
  // east side, ring by ring.
  const rows: RowDef[] = [];
  const lotRows: LotRowDef[] = [];
  const sites: SiteDef[] = [];
  const zoned = rings.slice(1);
  const rowsOf = (use: RowUse, ring?: RingLayout) => (ring ? [ring] : zoned).reduce((n, r) => n + r.uses.filter((u) => u === use).length, 0);
  const plotCount = (tier: PlotTier) => zoned.filter((r) => r.tier === tier).reduce((n, r) => n + rowsOf("residential", r) * r.perHalf, 0);
  const plotSlot: Record<PlotTier, number> = { premium: 0, standard: 0, economy: 0 };
  const siteSlot = { civic: 0, park: 0, square: 0 };
  const siteCount = { civic: rowsOf("civic"), park: rowsOf("park"), square: rowsOf("square") };
  /** Boards of the sites, numbered by format once every one is known. */
  const boards: Array<Omit<BillboardDef, "id">> = [];
  for (const ring of zoned) {
    const tier = ring.tier!;
    const house = plan.tiers[tier].house;
    const ringLots = rowsOf("ngo", ring) * ring.perHalf;
    let lotSlot = 0;
    for (let s = 0; s < plan.sides; s++) {
      const f = sideFrame(plan, s);
      for (const half of [-1, 1] as const) {
        const use = ring.uses[2 * s + (half === -1 ? 0 : 1)];
        /** Centre of parcel `i` of the half row along the side, in counter-clockwise order. */
        const parcel = (i: number) => half * (plan.laneWidth / 2 + ((half === -1 ? ring.perHalf - 1 - i : i) + 0.5) * ring.width);
        if (use === "ngo") {
          const row: LotRowDef = { ring: ring.id, side: s, half, width: ring.width, lots: [] };
          for (let i = 0; i < ring.perHalf; i++) {
            lotSlot++;
            // Like a lot of the square: the pad's centre 4.5 u behind the line where a porch ends, here the street's edge.
            row.lots.push({ id: `${ring.id}-${numbered(lotSlot, ringLots)}`, street: ring.id, slot: lotSlot, number: lots.length + row.lots.length + 1, ...at(s, ring.front + 4.5, parcel(i)), facing: f.facing });
          }
          lots.push(...row.lots);
          lotRows.push(row);
        } else if (use === "residential") {
          const plots: ResidentialPlot[] = [];
          const middle = ring.front + ring.depth / 2;
          for (let i = 0; i < ring.perHalf; i++) {
            const along = parcel(i);
            const slot = ++plotSlot[tier];
            plots.push({
              id: `${tier}-${numbered(slot, plotCount(tier))}`,
              tier,
              ring: ring.id,
              slot,
              ...at(s, middle, along),
              facing: f.facing,
              width: ring.width,
              depth: ring.depth,
              front: at(s, ring.front - PLOT_FRONT_STEP, along),
              house: at(s, middle - house.offset, along),
              hearth: at(s, middle - house.offset + 1, along),
            });
          }
          rows.push({ tier, ring: ring.id, side: s, half, width: ring.width, depth: ring.depth, plots });
        } else {
          const width = ring.perHalf * ring.width, along = half * (plan.laneWidth / 2 + width / 2), middle = ring.front + ring.depth / 2;
          const n = ++siteSlot[use];
          const kind = use === "civic" ? plan.civic[n - 1] : undefined;
          const id = `${use}-${numbered(n, siteCount[use])}`;
          const spec = kind ? CIVIC[kind] : null;
          // A civic building stands a setback behind the street; the centrepiece of a park or a square in its middle.
          const centreAt = spec ? ring.front + CIVIC_SETBACK + spec.halfDepth + 0.5 : middle;
          sites.push({ id, use, kind, ring: ring.id, side: s, half, ...at(s, middle, along), facing: f.facing, width, depth: ring.depth, centre: at(s, centreAt, along + (use === "park" ? -width / 4 : 0)), front: at(s, ring.front - PLOT_FRONT_STEP, along) });
          const onStreet = (offset: number) => at(s, ring.front - PLOT_FRONT_STEP, along + offset);
          if (spec) {
            // A lawn sign beside the building, level with its front wall; a screen on the roof of the halls that have one.
            // On the side of the avenue: towards the lane it would stand on the lane's paving.
            const beside = half * (spec.halfWidth + 1.75);
            boards.push({ format: "lawn", siteId: id, grounded: true, ...at(s, ring.front + CIVIC_SETBACK, along + beside), y: BOARD_HEIGHT.lawn, point: onStreet(beside) });
            // The panel starts a unit above the roof, on two short legs.
            if (spec.screen) boards.push({ format: "screen", siteId: id, grounded: false, ...at(s, centreAt, along), y: spec.screen + 1 + BOARD_FORMATS.screen.height / 2, point: onStreet(2.5) });
          } else {
            // A park: a street billboard at its back. A square: a screen. Both: a lawn sign near each end, by the street.
            // The bandstand of a park stands a quarter of the row to one side, so its billboard takes the other side.
            boards.push({ format: use === "park" ? "outdoor" : "screen", siteId: id, grounded: true, ...at(s, ring.back - (use === "park" ? 1.5 : 1), along + (use === "park" ? width / 4 : 0)), y: use === "park" ? BOARD_HEIGHT.outdoor : BOARD_HEIGHT.screen, point: onStreet(2.2) });
            // 2 u behind the street's edge: a sign never turns, and on some sides its length points at the street.
            for (const end of [-1, 1]) boards.push({ format: "lawn", siteId: id, grounded: true, ...at(s, ring.front + 2, along + end * (width / 2 - 1.5)), y: BOARD_HEIGHT.lawn, point: onStreet(end * (width / 2 - 1.5)) });
          }
        }
      }
    }
  }
  // A street billboard where every other avenue ends, on the open ground beyond the last ring and beside the
  // avenue, clear of its corridor (rule 1 of `SIGHTLINE` is about tall things on the avenue itself).
  if (zoned.length > 0)
    for (let s = 0; s < plan.sides; s += 2) {
      const a = ((2 * s + 1) * Math.PI) / plan.sides;
      const ax = Math.cos(a), az = Math.sin(a);
      // The last rows end about `edge` u from the end of the world: the mast stands in that strip, behind their corner.
      const out = worldRadius - plan.edge, beside = plan.avenueWidth / 2 + BOARD_FORMATS.outdoor.width / 2 + 0.5;
      boards.push({ format: "outdoor", grounded: true, x: round2(out * ax - beside * az), y: BOARD_HEIGHT.outdoor, z: round2(out * az + beside * ax), point: { x: round2((out - 1) * ax), z: round2((out - 1) * az) } });
    }
  for (const format of ["outdoor", "lawn", "screen"] as const) {
    const ofFormat = boards.filter((b) => b.format === format);
    ofFormat.forEach((b, i) => billboards.push({ id: `${format}-${numbered(i + 1, ofFormat.length)}`, ...b }));
  }

  // Street graph: the round street of the plaza, the avenues, one polygon street per ring and the lanes.
  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const node = (id: string, p: { x: number; z: number }) => (nodes.push({ id, ...p }), id);
  const link = (a: string, b: string, kind: StreetKind, width: number) => {
    const p = nodes.find((n) => n.id === a)!, q = nodes.find((n) => n.id === b)!;
    edges.push({ a, b, kind, width, length: round2(Math.hypot(p.x - q.x, p.z - q.z)) });
  };
  const ringRadius = (plan.ringStreet[0] + plan.ringStreet[1]) / 2;
  const streets = rings.filter((r) => r.street).map((r) => (r.street![0] + r.street![1]) / 2);
  const polar = (radius: number, angle: number) => ({ x: round2(radius * Math.cos(angle)), z: round2(radius * Math.sin(angle)) });
  const pad2 = (n: number) => numbered(n, plan.sides);
  for (let s = 0; s < plan.sides; s++) {
    // Avenue `s` leaves the square between side `s` and side `s + 1`.
    const avenue = ((2 * s + 1) * Math.PI) / plan.sides;
    let prev = node(`avenue-${pad2(s + 1)}-plaza`, polar(ringRadius, avenue));
    streets.forEach((apothem, k) => {
      const here = node(`avenue-${pad2(s + 1)}-street-${k + 1}`, polar(apothem / cos, avenue));
      link(prev, here, "avenue", plan.avenueWidth);
      prev = here;
    });
    link(prev, node(`avenue-${pad2(s + 1)}-end`, polar(worldRadius - 1, avenue)), "avenue", plan.avenueWidth);
    // Lane of side `s`: from the edge of the square, between the two plots of the frontage, across every street
    // and out past the last ring. With no ring it meets no street, so it stays out of the graph.
    if (streets.length === 0) continue;
    let lane = node(`lane-${pad2(s + 1)}-square`, at(s, frontage.front - 2, 0));
    streets.forEach((apothem, k) => {
      const here = node(`lane-${pad2(s + 1)}-street-${k + 1}`, at(s, apothem, 0));
      link(lane, here, "lane", plan.laneWidth);
      lane = here;
    });
    link(lane, node(`lane-${pad2(s + 1)}-end`, at(s, last.back + plan.backYard, 0)), "lane", plan.laneWidth);
  }
  for (let s = 0; s < plan.sides; s++) {
    const before = pad2(((s + plan.sides - 1) % plan.sides) + 1), here = pad2(s + 1);
    link(`avenue-${before}-plaza`, `avenue-${here}-plaza`, "plaza", plan.ringStreet[1] - plan.ringStreet[0]);
    streets.forEach((_, k) => {
      // Side `s` of street `k`: avenue `s - 1` → lane `s` → avenue `s`.
      link(`avenue-${before}-street-${k + 1}`, `lane-${here}-street-${k + 1}`, "street", plan.streetWidth);
      link(`lane-${here}-street-${k + 1}`, `avenue-${here}-street-${k + 1}`, "street", plan.streetWidth);
    });
  }

  return { plan, worldRadius, rings, lots, lotRows, shops, billboards, rows, plots: rows.flatMap((r) => r.plots), sites, graph: { nodes, edges } };
}

/** The village in force, derived from `VILLAGE_PLAN`. */
export const VILLAGE = layoutVillage(VILLAGE_PLAN);

export const WORLD_RADIUS = VILLAGE.worldRadius;
export const PLAZA_RADIUS = VILLAGE_PLAN.plazaRadius;
export const STREET_INNER = VILLAGE_PLAN.ringStreet[0];
export const STREET_OUTER = VILLAGE_PLAN.ringStreet[1];

/**
 * Lots reserved for approved NGOs (DEC-028): the square's frontage and the NGO rows of every ring. Mirrors the
 * `lots` rows (migrations 0002, 0003, 0012 and 0015); a test keeps them in sync. `plaza-01`…`plaza-08` existed
 * before the first expansion, `plaza-09`…`plaza-12` came with it, and the rings came with IMPL-0031.
 */
export const LOTS: LotDef[] = VILLAGE.lots;
/** The rows of lots on the rings (the lots of the square stand one to a half side). */
export const LOT_ROWS: LotRowDef[] = VILLAGE.lotRows;
/** Civic buildings, parks and squares (IMPL-0031, PROPOSTA). */
export const SITES: SiteDef[] = VILLAGE.sites;
const LOT_BY_ID = new Map(LOTS.map((lot) => [lot.id, lot]));
/** The lot of an id, or undefined: ids are checked against the plan, never parsed. */
export const lotById = (id: string): LotDef | undefined => LOT_BY_ID.get(id);
export const SHOPS: ShopDef[] = VILLAGE.shops;
export const BILLBOARDS: BillboardDef[] = VILLAGE.billboards;
/** Residential plots (PROPOSTA). Mirrors the `residential_plots` rows (migration 0012); a test keeps them in sync. */
export const RESIDENTIAL_PLOTS: ResidentialPlot[] = VILLAGE.plots;
export const RESIDENTIAL_ROWS: RowDef[] = VILLAGE.rows;
/** A plot as the UI names it (pt-BR): its number in its neighbourhood, never the raw id. "Terreno 12 · Bairro da Floresta". */
export const plotLabel = (plot: ResidentialPlot): string => `Terreno ${plot.slot} · ${VILLAGE_PLAN.tiers[plot.tier].label}`;
export const PATH_GRAPH: PathGraph = VILLAGE.graph;

/**
 * How far in front of a lot's centre its "Ir até lá" point is. A porch ends 4.5 u from the centre and a planned
 * route keeps the avatar's body (0.45 u) 0.25 u clear of it: 5.2 u is exactly that boundary, where rounding
 * decides whether the point is open ground, so the point stands 0.1 u beyond it.
 */
export const LOT_FRONT = 5.3;
/** Where the avatar stands in front of a lot: the "Ir até lá" point of the Explore panel. */
export const lotFront = (lot: LotDef) => ({ x: round2(lot.x + LOT_FRONT * Math.sin(lot.facing)), z: round2(lot.z + LOT_FRONT * Math.cos(lot.facing)) });

/**
 * Name and theme of each shop (PROPOSTA): shown on the shop's panel next to "Esta loja está fechada.". A theme says
 * what the building looks like it is about, not what a visitor will get: whether and how a shop works is not
 * decided, there is no catalogue, and nothing is sold (DEC-042, IMPL-0002). Names are the village's own; no
 * real shop, brand or partner.
 */
export const SHOP_COPY: ReadonlyArray<{ name: string; theme: string }> = [
  { name: "Ateliê de Enfeites", theme: "enfeites de Natal" },
  { name: "Oficina de Brinquedos", theme: "brinquedos e lembranças" },
  { name: "Alfaiataria de Inverno", theme: "roupas de inverno" },
  { name: "Empório da Lareira", theme: "lenha e lanternas" },
];
export const shopCopy = (shopId: string) => SHOP_COPY[SHOPS.findIndex((s) => s.id === shopId) % SHOP_COPY.length] ?? SHOP_COPY[0];

/**
 * Seasonal notices of the village shown on the billboards (PROPOSTA): fixed text from this repository, no
 * third-party content and no brand. Whether a frame may ever show anything else is undecided (PEN-008, OQ-18),
 * and the UI does not mention it.
 */
export const VILLAGE_NOTICES: readonly string[] = [
  "Boas festas! A Vila deseja um Natal de paz.",
  "Brincar na Vila é de graça. Doar é sempre uma escolha.",
  "Conheça as ONGs ao redor da praça.",
  "A árvore da praça é o coração da Vila.",
  "Cada casa de ONG tem uma história para contar.",
  "Na Vila tudo é a pé: aproveite o passeio.",
  "As avenidas levam sempre à árvore.",
  "Gentileza é o enfeite que não sai de moda.",
];
/** What a lawn sign says: a few words, for a board two units wide. Fixed text of the village, like the notices. */
export const SHORT_NOTICES: readonly string[] = ["Boas festas!", "Feliz Natal", "Paz na Vila", "Doar é escolha", "Brincar é grátis", "Bem-vindos"];
const boardIndex = (billboardId: string) => Math.max(0, BILLBOARDS.findIndex((b) => b.id === billboardId));
const noticesOf = (billboardId: string) => (BILLBOARDS[boardIndex(billboardId)]?.format === "lawn" ? SHORT_NOTICES : VILLAGE_NOTICES);
/** The notice a board shows (a screen: the first of the ones it cycles through). */
export const billboardNotice = (billboardId: string) => noticesOf(billboardId)[boardIndex(billboardId) % noticesOf(billboardId).length];
/** How many notices a screen cycles through, and how long each one stays (seconds). */
export const SCREEN_SLIDES = 2;
export const SCREEN_SLIDE_SECONDS = 8;
/** Every notice a board shows in turn: one, or `SCREEN_SLIDES` for a screen. */
export const boardNotices = (billboardId: string): string[] => {
  const board = BILLBOARDS[boardIndex(billboardId)];
  const count = board?.format === "screen" ? SCREEN_SLIDES : 1;
  const list = noticesOf(billboardId);
  return Array.from({ length: count }, (_, k) => list[(boardIndex(billboardId) + k * 3) % list.length]);
};

/** A street as the UI names it: the square, or the street of a ring ("Rua 2"). Never the raw id. */
export const streetLabel = (street: string): string => (street === "plaza" ? "Praça" : `Rua ${VILLAGE.rings.findIndex((r) => r.id === street)}`);

/**
 * Names of the parks and squares (PROPOSTA): the village's own, in the order they come around the village.
 * A civic building takes its name from `CIVIC`.
 */
const PARK_NAMES = ["Parque dos Pinheiros", "Parque do Coreto", "Parque da Floresta", "Parque das Lanternas"] as const;
const SQUARE_NAMES = ["Praça da Fonte", "Praça das Luzes", "Praça do Sino"] as const;
const numberOf = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1)) - 1;
/** A civic building, a park or a square as its panel names it. */
export function siteCopy(site: SiteDef): { name: string; about: string } {
  if (site.kind) return { name: CIVIC[site.kind].name, about: CIVIC[site.kind].about };
  if (site.use === "park") return { name: PARK_NAMES[numberOf(site.id) % PARK_NAMES.length], about: "Um parque com coreto, bancos e pinheiros." };
  return { name: SQUARE_NAMES[numberOf(site.id) % SQUARE_NAMES.length], about: "Uma praça com fonte, bancos e postes." };
}

/** Hidden gifts (mission "find 2 gifts"). */
export const GIFTS = [
  { id: "gift-palm", x: 9.5, z: -9.5 },
  { id: "gift-bench", x: -10, z: 6 },
  { id: "gift-street", x: 0, z: 15 },
] as const;

/**
 * Snowy pines inside the walkable area. The three small ones stand by the plaza; the tall ones form a belt
 * behind the last ring, two per side, clear of the lanes and of every avenue (no tree stands between a plot
 * and the tree, see `SIGHTLINE`). The gift id "gift-palm" is a persisted mission event id and must not
 * change even though palms became pines (DEC-042 idempotency).
 */
const PLAZA_PINES: [number, number][] = [[10, 10], [-10, -10], [-11, 9.5]];
/**
 * Rounds to a whole voxel, a half away from zero on both sides (`Math.round` sends 80.5 to 81 and -80.5 to
 * -80, which left the belt one unit nearer on the west and on the north than on the east and on the south).
 */
const roundAway = (v: number) => Math.sign(v) * Math.round(Math.abs(v) + 1e-9);
const BELT = VILLAGE.rings[VILLAGE.rings.length - 1];
/** A small pine in every park (IMPL-0031), behind its bench: the same model, sway and collider as the plaza's. */
const PARK_PINES: [number, number][] = SITES.filter((site) => site.use === "park").map((site) => {
  const ring = VILLAGE.rings.find((r) => r.id === site.ring)!;
  const f = sideFrame(VILLAGE_PLAN, site.side);
  const apothem = ring.back - 2.6, along = site.half * (VILLAGE_PLAN.laneWidth / 2 + site.width / 2) + 0.5;
  return [Math.round(apothem * f.nx + along * f.tx), Math.round(apothem * f.nz + along * f.tz)];
});
const SMALL_PINES = PLAZA_PINES.length + PARK_PINES.length;
export const PINES: [number, number][] = [
  ...PLAZA_PINES,
  ...PARK_PINES,
  ...Array.from({ length: VILLAGE_PLAN.sides }, (_, s) => {
    const f = sideFrame(VILLAGE_PLAN, s);
    const apothem = BELT.back + VILLAGE_PLAN.backYard + 3.5;
    return [-1, 1].map((half): [number, number] => {
      const along = half * Math.min(BELT.reach * 0.55, 9);
      return [roundAway(apothem * f.nx + along * f.tx), roundAway(apothem * f.nz + along * f.tz)];
    });
  }).flat(),
];
/** Pine size by index: the ones by the plaza and in the parks stay small so they never hide the avatar from the camera. */
export const pineIsTall = (i: number): boolean => i >= SMALL_PINES;
/** Where a pine stands: the drawn model and its collider both snap to whole voxels. */
export const pineAt = ([x, z]: readonly [number, number]): Placed => ({ x: Math.round(x), z: Math.round(z) });

/** Decorative forest outside the walkable radius (no collision; frames the village). */
export const FOREST_INNER = WORLD_RADIUS + 4;
export const FOREST_OUTER = WORLD_RADIUS + 30;

/**
 * The lumberjack's wood yard (PROPOSTA): a named spot at the end of the northern lane, by the forest, with a
 * pile of logs. The lumberjack works there (IMPL-0025, `life.ts`); the yard has not opened and the firewood quest
 * is not built.
 */
export const WOOD_YARD = (() => {
  const s = Math.round((VILLAGE_PLAN.sides * 3) / 4) % VILLAGE_PLAN.sides;
  const f = sideFrame(VILLAGE_PLAN, s);
  const apothem = BELT.back + VILLAGE_PLAN.backYard + 3;
  return { x: round2(apothem * f.nx + 3.5 * f.tx), z: round2(apothem * f.nz + 3.5 * f.tz), rot: f.facing };
})();

/** Frozen pond (decor, walkable: no gameplay effect). */
/** In the festive band of the square, in front of the north-east lots (it used to sit where the frontage now is). */
export const POND = { x: 15.06, z: -15.06, radius: 3.2 } as const;

/** Snowmen around the plaza (decor). */
export const SNOWMEN: [number, number, number][] = [
  [-5, -9.5, 0.6], [9.5, 4, -2.4], [4.5, -21.5, 0.4],
];

/** Santa's parked sleigh with two reindeer (decor), in the square's band south of the tree. Faces +x. */
export const SLEIGH = { x: -2.7, z: 20.2 } as const;
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
 * Villagers face +z: arms across x, coat two voxels deep. The quest NPCs stand still and block the avatar. The
 * villagers and animals that walk (IMPL-0025, `life.ts`) have no collider: they step aside instead.
 */
const VILLAGER_SOLID: Solid = [-0.75, 0.75, -0.45, 0.45, 0.45];
/**
 * Generated props placed as decor (IMPL-0010, PROPOSTA; final layout is PEN-017). Copies of one entry share
 * the seed, so they are drawn as one instanced model. Faces the plaza unless `rot` says otherwise.
 * Kept clear of lots, shops, the avenues, the round street (13–17), gifts, the pond and the sleigh.
 */
export interface PropPlacement {
  kind: "market-stall" | "panettone-stand" | "lantern" | "fence" | "mailbox" | "signpost" | "sled" | "log-pile";
  seed: string;
  /** What blocks the avatar, per copy. Depends on the seed (e.g. the stall width), so it sits next to it. */
  solid: Solid;
  at: Array<{ x: number; z: number; rot?: number }>;
}

const facePlaza = (x: number, z: number) => ({ x, z, rot: Math.atan2(-x, -z) });

/**
 * The reindeer pens (IMPL-0025, PROPOSTA): one on the square's band beside the lane of the south-east side and
 * one beside the lane of the south-west side, each open towards the plaza. `apothem` and `along` are the
 * rectangle the rails enclose, in the frame of the side (`sideFrame`): 4.5 u deep (two rails of 2.25 u) and
 * 3.5 u wide (two of 1.75 u). The reindeer that live in them are in `life.ts`.
 */
export const PADDOCKS = [1, 3].map((side) => ({ side, apothem: [19.6, 24.1] as const, along: [2.3, 5.8] as const }));
function paddockRails(p: (typeof PADDOCKS)[number]) {
  const f = sideFrame(VILLAGE_PLAN, p.side);
  const at = (apothem: number, along: number, rot: number) => ({ x: round2(apothem * f.nx + along * f.tx), z: round2(apothem * f.nz + along * f.tz), rot });
  // A rail runs along its local +x, which is `(cos rot, -sin rot)` in the world.
  const tangent = Math.atan2(-f.tz, f.tx), radial = Math.atan2(-f.nz, f.nx);
  const [a0, a1] = p.apothem, [l0, l1] = p.along;
  return {
    back: [0.25, 0.75].map((t) => at(a1, l0 + (l1 - l0) * t, tangent)),
    sides: [l0, l1].flatMap((l) => [0.25, 0.75].map((t) => at(a0 + (a1 - a0) * t, l, radial))),
  };
}
/** The children's sled, by the pond (quest `kids-sled-run`, PROPOSTA quests-v1). */
const KIDS_SLED = { x: 13.44, z: -19.8 } as const;

export const PLACED_PROPS: PropPlacement[] = [
  // Christmas market in the west of the square, in front of the west shop and lot.
  // Stalls: counter plus the awning's front lip, which hangs at chest height (front = local +z).
  { kind: "market-stall", seed: "market-west", solid: [-1.47, 1.47, -0.63, 1.05, 0.2], at: [facePlaza(-20.5, -2.4)] },
  { kind: "panettone-stand", seed: "panettone-west", solid: [-1.89, 1.89, -0.63, 1.05, 0.2], at: [facePlaza(-20.5, 2.4)] },
  { kind: "fence", seed: "market-fence", solid: [-1.13, 1.13, -0.13, 0.13, 0.13], at: [{ x: -23, z: -2.4, rot: Math.PI / 2 }, { x: -23, z: 2.4, rot: Math.PI / 2 }] },
  { kind: "market-stall", seed: "market-east", solid: [-1.47, 1.47, -0.63, 1.05, 0.2], at: [facePlaza(20.5, 0)] },
  // Lanterns between the round street and the lots (the pond took the place of the north-east one).
  { kind: "lantern", seed: "ring-lantern", solid: [-0.45, 0.45, -0.45, 0.45, 0.45], at: [45, 135, 225].map((d) => facePlaza(18.6 * Math.cos((d * Math.PI) / 180), 18.6 * Math.sin((d * Math.PI) / 180))) },
  // Welcome corner by the spawn. The signpost's lowest board points along local +z at chest height.
  { kind: "signpost", seed: "welcome-sign", solid: [-0.2, 0.2, -0.2, 0.86, 0.2], at: [{ x: -2.4, z: 12.6, rot: 0 }] },
  { kind: "mailbox", seed: "village-mail", solid: [-0.3, 0.45, -0.5, 0.6, 0.3], at: [{ x: 2.4, z: 12.6, rot: Math.PI }] },
  { kind: "sled", seed: "kids-sled", solid: [-0.77, 1.21, -0.33, 0.33, 0.3], at: [{ x: KIDS_SLED.x, z: KIDS_SLED.z, rot: 0.4 }] },
  // Lanterns on both sides of every lane where it leaves the square, between the two plots of the frontage.
  {
    kind: "lantern",
    seed: "lane-lantern",
    solid: [-0.45, 0.45, -0.45, 0.45, 0.45],
    at: Array.from({ length: VILLAGE_PLAN.sides }, (_, s) => {
      const f = sideFrame(VILLAGE_PLAN, s);
      const apothem = VILLAGE.rings[0].front - 0.6;
      return [-1, 1].map((half) => {
        const along = half * (VILLAGE_PLAN.laneWidth / 2 + 0.9);
        return { x: round2(apothem * f.nx + along * f.tx), z: round2(apothem * f.nz + along * f.tz), rot: f.facing };
      });
    }).flat(),
  },
  // The wood yard: logs stacked by the forest (the stack runs along local x).
  { kind: "log-pile", seed: "wood-yard", solid: [-1.75, 1.75, -0.75, 0.75, 0.25], at: [WOOD_YARD] },
  // The reindeer pens (IMPL-0025): two rails at the back and two on each side, open towards the plaza.
  { kind: "fence", seed: "paddock-208", solid: [-0.88, 0.88, -0.13, 0.13, 0.13], at: PADDOCKS.flatMap((p) => paddockRails(p).back) },
  { kind: "fence", seed: "paddock-233", solid: [-1.13, 1.13, -0.13, 0.13, 0.13], at: PADDOCKS.flatMap((p) => paddockRails(p).sides) },
];

export const LAMPS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (2 * Math.PI * i) / 8;
  return [Math.round(12.2 * Math.cos(a) * 100) / 100, Math.round(12.2 * Math.sin(a) * 100) / 100];
});

/** Benches on the plaza side of every other lamp post, lengthwise along the ring. */
export const BENCHES: Required<Placed>[] = LAMPS.filter((_, i) => i % 2 === 1).map(([x, z]) => ({ x: x * 0.92, z: z * 0.92, rot: Math.atan2(x, z) }));

/**
 * Street lamps at the corners where the avenues cross the ring streets, on the verge behind the inner row
 * (same model as the plaza lamps). The number of lamps is one of the cues of a tier: both corners of every
 * side on the premium street, one on the standard street and one, at the other corner, on the economy street
 * (IMPL-0030: a street with no lamp could not be told from its yards at night; its cottages keep the lantern
 * on a stake).
 */
export const STREET_LAMPS: [number, number][] = VILLAGE.rings.flatMap((ring) => {
  if (!ring.street) return [];
  const apothem = ring.street[0] - 0.75;
  const reach = apothem * Math.tan(Math.PI / VILLAGE_PLAN.sides) - avenueCut(VILLAGE_PLAN) - 0.9;
  return Array.from({ length: VILLAGE_PLAN.sides }, (_, s) => {
    const f = sideFrame(VILLAGE_PLAN, s);
    return (ring.tier === "premium" ? [-1, 1] : ring.tier === "standard" ? [1] : [-1]).map((half): [number, number] => [round2(apothem * f.nx + half * reach * f.tx), round2(apothem * f.nz + half * reach * f.tz)]);
  }).flat();
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
  { id: "sleigh-keeper", name: "Baltazar", role: "Guardião do trenó do Noel", seed: "sleigh-keeper", x: -6, z: 21.8, rot: Math.atan2(6, -21.8) },
  { id: "market-keeper", name: "Dona Filó", role: "Mercadora do mercado oeste", seed: "market-keeper", x: -18.6, z: 0, rot: Math.atan2(18.6, 0) },
  { id: "postmaster", name: "Seu Nivaldo", role: "Carteiro da Vila", seed: "postmaster", x: 4.5, z: 11.8, rot: Math.atan2(-4.5, -11.8) },
  { id: "pond-keeper", name: "Aurora", role: "Vigia do lago congelado", seed: "pond-keeper", x: 16.3, z: -10.4, rot: Math.atan2(-16.3, 10.4) },
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
  { id: "lantern-lake-1", questId: "lake-lanterns", objectId: "lake-lantern", x: 19.5, z: 14.5 },
  { id: "lantern-lake-2", questId: "lake-lanterns", objectId: "lake-lantern", x: 22.5, z: 5.5 },
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
  { id: "sled-ride", questId: "kids-sled-run", objectId: "kids-sled", x: KIDS_SLED.x, z: KIDS_SLED.z, radius: 3.5 },
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

/** Walls of a shop, in shop-local units (front = local +z; the awning hangs above head height). Every shop shares the footprint. */
export const SHOP_SOLID: readonly Rect[] = [[-3.5, 3.5, -3.5, 3.5]];

/** Walls and porch of a tier's chalet, around the chalet's own centre: the worst case (the porch is optional). */
export function houseEnvelope(tier: PlotTier, plan: VillagePlan = VILLAGE_PLAN): Rect[] {
  const { halfWidth: hx, halfDepth: hz, porch } = plan.tiers[tier].house;
  const walls: Rect = [-hx - 0.5, hx + 0.5, -hz - 0.5, hz + 0.5];
  return porch > 0 ? [walls, [-Math.min(2, hx) - 0.5, Math.min(2, hx) + 0.5, hz + 0.5, hz + (hz === 3 ? 1 : 2) + 0.5]] : [walls];
}

/**
 * Colliders of the chalet drawn on a residential plot: `house` = the footprint of the generated model
 * (`GenModel.solid`), or the tier's envelope when the model is not at hand (tests in this package).
 */
export function plotColliders(plot: ResidentialPlot, house: readonly Rect[] | null = null): Obstacle[] {
  const at = { x: plot.house.x, z: plot.house.z, rot: plot.facing };
  return (house ?? houseEnvelope(plot.tier)).map(([x0, x1, z0, z1]) => footprint(at, x0, x1, z0, z1));
}

/**
 * What is drawn around the chalets of a row, besides the ground (IMPL-0024): the cues that tell the tiers
 * apart without a badge. Each part is a small voxel model (`apps/client/src/scene/villageModels.ts`) and its
 * footprint, and every one blocks the avatar. The fillers also close the gap between two chalets of a row,
 * which is wider than the avatar but too narrow to plan a route through.
 *
 * - premium: a low stone wall along the street with a gate between two lantern pillars, and two shrubs;
 * - standard: a short picket fence between front yards and a hedge between neighbours;
 * - economy: a lantern on a stake at one corner and firewood stacked between the cottages.
 */
export type DressingKind = "stone-wall" | "gate-pillar" | "shrub" | "picket" | "hedge" | "stake" | "firewood";
export interface DressingPart extends Required<Placed> {
  kind: DressingKind;
  /** Voxels along the part's local +x (0.5 u each) and across it. */
  length: number;
  thick: number;
  solid: Solid;
}

/** Voxel size of every dressing part. */
export const DRESSING_VOXEL = 0.5;

function rowDressing(row: RowDef): DressingPart[] {
  const tier = VILLAGE_PLAN.tiers[row.tier];
  const out: DressingPart[] = [];
  const v = DRESSING_VOXEL;
  /**
   * A part whose first voxel is centred on the plot-local point. It runs along the plot's local +x, or,
   * with `inward`, from the street into the plot (its own +x is then the plot's -z).
   */
  const part = (plot: ResidentialPlot, kind: DressingKind, lx: number, lz: number, length = 1, thick = 1, r = 0, inward = false) => {
    const c = Math.cos(plot.facing), sn = Math.sin(plot.facing);
    out.push({
      kind, length, thick, rot: inward ? plot.facing + Math.PI / 2 : plot.facing,
      x: plot.x + lx * c + lz * sn, z: plot.z - lx * sn + lz * c,
      solid: [-v / 2, (length - 0.5) * v, -v / 2, (thick - 0.5) * v, r],
    });
  };
  const w = row.width, d = row.depth;
  const wallHalf = tier.house.halfWidth + 0.5, wallDepth = 2 * tier.house.halfDepth + 1;
  const gap = Math.round((w - 2 * wallHalf) / v);
  // A gap of up to 2.5 u is closed whole. A wider one keeps a passage a route can be planned through, with a
  // short stack beside the wall.
  const filler = gap * v <= 2.5 ? gap : 4;
  row.plots.forEach((plot, i) => {
    if (row.tier === "premium") {
      // A wall from each side edge to the gate, set back from the front edge; pillars at the gate; two shrubs.
      const gate = 1.5, run = Math.round((w / 2 - gate - v) / v);
      part(plot, "stone-wall", -w / 2 + v / 2, d / 2 - 0.75, run);
      part(plot, "stone-wall", gate + v + v / 2, d / 2 - 0.75, run);
      part(plot, "gate-pillar", -gate - v / 2, d / 2 - 0.75);
      part(plot, "gate-pillar", gate + v / 2, d / 2 - 0.75);
      for (const side of [-1, 1]) part(plot, "shrub", side * (w / 2 - 1.5) - v, d / 2 - 2.75, 3, 3, 0.5);
    } else if (row.tier === "standard") {
      // A short picket fence on the plot's boundary towards the lane, from the front edge 2 u into the plot
      // (the yard stays open to the street, and the end of the row stays open to the avenue).
      part(plot, "picket", (-row.half * w) / 2, d / 2 - v / 2, 4, 1, 0, true);
    } else {
      part(plot, "stake", -w / 2 + 0.75, d / 2 - 0.5, 1, 1, 0.25);
    }
    // Filler between this chalet and the next one of the row, as deep as the walls.
    if (row.tier !== "premium" && i + 1 < row.plots.length && gap > 0) {
      part(plot, row.tier === "standard" ? "hedge" : "firewood", wallHalf + v / 2, tier.house.offset - wallDepth / 2 + v / 2, filler, Math.round(wallDepth / v));
    }
  });
  return out;
}
/** Every dressing part of the residential rows, in the order of `RESIDENTIAL_ROWS`. */
export const RESIDENTIAL_DRESSING: DressingPart[] = RESIDENTIAL_ROWS.flatMap(rowDressing);

/**
 * A hedge between two neighbouring lots of a ring (IMPL-0031), as deep as their pads. Between two chalets the
 * gap is wider than the avatar and too narrow to plan a route through; the hedge closes it, and tells one
 * lot's garden from the next. Lots at least 11 u wide have open gardens instead.
 */
function lotRowDressing(row: LotRowDef): DressingPart[] {
  const gap = row.width - 7;
  if (gap >= 4) return [];
  const v = DRESSING_VOXEL;
  const thick = gap <= 2.5 ? 2 : Math.round((gap - 1) / v), length = Math.round(7 / v);
  const ring = VILLAGE.rings.find((r) => r.id === row.ring)!;
  const f = sideFrame(VILLAGE_PLAN, row.side);
  const out: DressingPart[] = [];
  for (let k = 1; k < row.lots.length; k++) {
    // The boundary between parcel `k - 1` and parcel `k`, counted from the lane; the hedge grows towards +t.
    const boundary = row.half * (VILLAGE_PLAN.laneWidth / 2 + k * row.width);
    const apothem = ring.front + 1 + v / 2, along = boundary - ((thick - 1) * v) / 2;
    out.push({ kind: "hedge", length, thick, rot: f.facing + Math.PI / 2, x: apothem * f.nx + along * f.tx, z: apothem * f.nz + along * f.tz, solid: [-v / 2, (length - 0.5) * v, -v / 2, (thick - 0.5) * v, 0] });
  }
  return out;
}
/** The hedges between the lots of the rings, in the order of `LOT_ROWS`. */
export const LOT_DRESSING: DressingPart[] = LOT_ROWS.flatMap(lotRowDressing);

/**
 * What stands in a park or on a square besides its boards (IMPL-0031, PROPOSTA): a bandstand, a bench and a
 * small pine (`PARK_PINES`); a fountain, two lamp posts and, where there is room, two benches. Each has a model in
 * `apps/client/src/scene/villageModels.ts` (or reuses the plaza's) and blocks the avatar.
 */
export type SitePropKind = "bandstand" | "fountain" | "site-bench" | "site-lamp";
export interface SiteProp extends Required<Placed> {
  kind: SitePropKind;
  siteId: string;
}
/** Footprint of each site prop around its centre. The bandstand and the fountain are solid: nobody walks into them. */
export const SITE_PROP_SOLID: Record<SitePropKind, Solid> = {
  bandstand: [-2.5, 2.5, -2.5, 2.5, 0.5],
  fountain: [-2.5, 2.5, -2.5, 2.5, 1.5],
  "site-bench": [-0.75, 0.75, -0.25, 0.25, 0.25],
  // The pole plus the wreath on its +z side, like the plaza's lamps.
  "site-lamp": [-0.55, 0.55, -0.35, 0.75, 0.55],
};
function siteProps(site: SiteDef): SiteProp[] {
  if (site.use === "civic") return [];
  const ring = VILLAGE.rings.find((r) => r.id === site.ring)!;
  const f = sideFrame(VILLAGE_PLAN, site.side);
  const mid = site.half * (VILLAGE_PLAN.laneWidth / 2 + site.width / 2);
  /** A point of the site: `apothem` u behind the street's edge, `along` u from the middle of the row. */
  const at = (kind: SitePropKind, apothem: number, along: number, rot = f.facing): SiteProp => ({
    kind, siteId: site.id, rot,
    x: round2((ring.front + apothem) * f.nx + (mid + along) * f.tx), z: round2((ring.front + apothem) * f.nz + (mid + along) * f.tz),
  });
  const w = site.width, d = site.depth;
  // A park also has a small pine (`PARK_PINES`): it sways, so it is drawn with the other pines.
  if (site.use === "park") return [at("bandstand", d / 2, -w / 4), at("site-bench", 1.2, 0)];
  return [
    at("fountain", d / 2, 0),
    // Benches beside the fountain where the square is wide enough to walk around them.
    ...(w >= 16 ? [-1, 1].map((end) => at("site-bench", d / 2, end * 5, f.facing + Math.PI / 2)) : []),
    ...[-1, 1].map((end) => at("site-lamp", d - 1.5, end * (w / 2 - 1.2), 0)),
  ];
}
/** Every prop of the parks and squares, in the order of `SITES`. */
export const SITE_PROPS: SiteProp[] = SITES.flatMap(siteProps);

/** Walls (and portico) of a civic building, around the building's own centre. */
export function siteColliders(site: SiteDef): Obstacle[] {
  if (!site.kind) return [];
  return CIVIC[site.kind].solid.map(([x0, x1, z0, z1]) => footprint({ x: site.centre.x, z: site.centre.z, rot: site.facing }, x0, x1, z0, z1));
}

/** Something solid on the ground plane that blocks the avatar: a circle or a rounded rectangle. */
export type Obstacle = Collider;

/**
 * Static obstacles inside the walkable area (IMPL-0016): one entry per solid thing that is drawn, sized
 * from its voxels below head height, so nothing solid is walk-through and nothing invisible blocks. The
 * world edge is handled by `clampToWorld`; lots and the chalets of the residential plots are added by the
 * client (`lotColliders`, `plotColliders`), quest NPCs and the lectern by `QUEST_OBSTACLES`. Gifts, quest
 * items, the pond and perched birds are walkable on purpose.
 *
 * The tree and the pines block at their lowest boughs, minus a brush of 0.3 u: the avatar touches the
 * outer needles but never stands inside the foliage. Small pines carry boughs from knee height, tall ones
 * and the tree from 2 u up (head height).
 */
export const OBSTACLES: Obstacle[] = [
  { x: 0, z: 0, r: TREE_BOUGHS_RADIUS },
  ...PINES.map((p, i) => ({ ...pineAt(p), r: pineIsTall(i) ? 3.2 : 2.2 })).filter((p) => Math.hypot(p.x, p.z) < WORLD_RADIUS + 1),
  // Lamp posts: the pole plus the wreath that hangs on its +z side at chest height.
  ...[...LAMPS, ...STREET_LAMPS].map(([x, z]) => ({ x, z: z + 0.2, r: 0.55 })),
  ...BENCHES.map((b) => solid(b, [-0.75, 0.75, -0.25, 0.25, 0.25])),
  ...SNOWMEN.map(([x, z]) => ({ x, z, r: 0.85 })),
  solid(SLEIGH, [-1.75, 2.75, -1.25, 1.25, 0.25]),
  // Reindeer: legs, body and tail; the neck and head are above the avatar.
  ...REINDEER.map((d) => solid(d, [-1.4, 1.3, -0.52, 0.52, 0.5])),
  ...PLACED_PROPS.flatMap((p) => p.at.map((at) => solid(at, p.solid))),
  ...SHOPS.flatMap((shop) => SHOP_SOLID.map(([x0, x1, z0, z1]) => footprint({ x: shop.x, z: shop.z, rot: shop.facing }, x0, x1, z0, z1))),
  ...RESIDENTIAL_DRESSING.map((part) => solid(part, part.solid)),
  // The rings (IMPL-0031): hedges between lots, civic buildings, what stands in the parks and squares, and the
  // masts and lawn signs of the boards (a board never turns: it faces the camera).
  ...LOT_DRESSING.map((part) => solid(part, part.solid)),
  ...SITES.flatMap(siteColliders),
  ...SITE_PROPS.map((prop) => solid(prop, SITE_PROP_SOLID[prop.kind])),
  ...BILLBOARDS.filter((b) => b.grounded).flatMap((b) => BOARD_SOLID[b.format].map((rect) => solid({ x: b.x, z: b.z }, rect))),
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

/** Ground under a point: what is painted there, and what a footstep sounds like. */
export type GroundKind =
  | "ice" | "plaza" | "ring-street" | "avenue" | "lane" | `street-${PlotTier}` | `path-${PlotTier}` | `yard-${PlotTier}` | "pad" | "snow"
  // The rings (IMPL-0031): the garden of an NGO lot, the forecourt of a civic building, a park and a square.
  | "yard-lot" | "civic" | "park" | "square";

const TWO_PI = Math.PI * 2;

/**
 * What the ground is at a point (IMPL-0024, IMPL-0031): the same function paints the voxel ground and picks
 * the footstep sound. Paving is one of the cues of a tier: cobbles on the premium street and a paved path to
 * each door, asphalt on the standard street, packed earth on the economy street (IMPL-0030).
 */
export function groundAt(x: number, z: number): GroundKind {
  if (Math.hypot(x - POND.x, z - POND.z) <= POND.radius) return "ice";
  const r = Math.hypot(x, z);
  if (r <= PLAZA_RADIUS) return "plaza";
  if (r >= STREET_INNER && r <= STREET_OUTER) return "ring-street";
  if (r < STREET_INNER || r > WORLD_RADIUS + 3) return "snow";
  const plan = VILLAGE_PLAN;
  const step = TWO_PI / plan.sides;
  const s = ((Math.round(Math.atan2(z, x) / step) % plan.sides) + plan.sides) % plan.sides;
  const f = sideFrame(plan, s);
  const apothem = x * f.nx + z * f.nz, along = x * f.tx + z * f.tz;
  // Distance to the axis of the nearer avenue, which leaves the square half a step from the side's axis.
  const toAvenue = Math.abs(apothem * Math.sin(step / 2) - Math.abs(along) * Math.cos(step / 2));
  if (toAvenue <= plan.avenueWidth / 2) return "avenue";
  const frontage = VILLAGE.rings[0];
  if (apothem < frontage.front) return "snow";
  if (Math.abs(along) <= plan.laneWidth / 2) {
    for (const ring of VILLAGE.rings) if (ring.street && apothem >= ring.street[0] && apothem <= ring.street[1]) return `street-${ring.tier!}`;
    return "lane";
  }
  for (const ring of VILLAGE.rings) {
    if (ring.street && apothem >= ring.street[0] && apothem <= ring.street[1]) return `street-${ring.tier!}`;
    if (apothem < ring.front || apothem > ring.back || Math.abs(along) > ring.reach) continue;
    /** Middle, along the side, of the parcel the point is on. */
    const centre = plan.laneWidth / 2 + (Math.floor((Math.abs(along) - plan.laneWidth / 2) / ring.width) + 0.5) * ring.width;
    const off = Math.abs(Math.abs(along) - centre);
    if (ring.tier === null) return off <= 3.5 && apothem >= ring.front + 1 ? "pad" : "snow";
    const use = ring.uses[2 * s + (along < 0 ? 0 : 1)];
    if (use === "civic" || use === "park" || use === "square") return use;
    if (use === "ngo") {
      // The pad of the lot and, in front of it, a paved step from the street as wide as a porch.
      if (off <= 3.5 && apothem >= ring.front + 1 && apothem <= ring.front + 8) return "pad";
      return off <= 2.5 && apothem < ring.front + 1 ? "pad" : "yard-lot";
    }
    const house = plan.tiers[ring.tier].house;
    const door = ring.front + ring.depth / 2 - house.offset - house.halfDepth - 0.5;
    if (ring.tier !== "economy" && off <= 1 && apothem <= door) return `path-${ring.tier}`;
    return `yard-${ring.tier}`;
  }
  return "snow";
}

export type Surface = "stone" | "packed" | "snow" | "ice";

/** Ground material under a point (footstep sound, snow kick-up). Mirrors the ground layout. */
export function surfaceAt(x: number, z: number): Surface {
  const kind = groundAt(x, z);
  if (kind === "ice") return "ice";
  if (kind === "plaza" || kind === "street-premium" || kind === "path-premium" || kind === "pad" || kind === "civic" || kind === "square") return "stone";
  if (kind === "ring-street" || kind === "avenue" || kind === "lane" || kind === "street-standard" || kind === "street-economy" || kind === "path-standard") return "packed";
  return "snow";
}

/**
 * Sightline rule (IMPL-0024): what the layout keeps open towards the tree, each rule stated as exactly what
 * `village.test.ts` checks. "Tall" means the chalets (of lots and of residential plots), the shops and the
 * pines; lamp posts, lanterns, stalls, the sleigh, fences and hedges are not counted.
 *
 * 1. Avenues. Every avenue is a straight corridor to the tree: no tall thing stands within `margin` of its
 *    edges, from its far end to the tree's boughs. This is the rule that can fail: a pine, a lot or a row
 *    placed on an avenue's line breaks it.
 * 2. Rings. The walk along the street from the front of a residential plot, of a lot of a ring or of a civic
 *    building, park or square to the avenue of its half row is at most `maxWalk` long. That stretch holding no tall thing is checked too, but it follows from the
 *    layout (nothing is ever placed on a street), so only the length says something about a plan.
 * 3. Frontage. No tall thing stands between the porch line of a lot of the square or a shop and the round
 *    street of the plaza, on the line towards the tree. It also follows from the layout (the band between them holds only
 *    low scenery) and guards against a tall thing being placed there later.
 *
 * The rule does not say the tree is seen from every plot or lot. A plot sees its street, not the tree; and
 * the straight line from a lot to the tree may cross low scenery of the square (today the sleigh in front of
 * `plaza-03`, a small pine in front of `plaza-04` and the panettone stall in front of `shop-03`).
 */
export const SIGHTLINE = { maxHeight: 3, margin: 0.25, maxWalk: 30 } as const;

/** One straight view of the rule above: a corridor of `width` between two points (0 = a line). */
export interface Sightline {
  id: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  width: number;
}

/** The avenue corridors (rule 1) and, per plot, lot, shop and site, the stretches of rules 2 and 3. */
export function sightlines(village: VillageLayout = VILLAGE): { corridors: Sightline[]; fronts: Sightline[] } {
  const { plan, graph } = village;
  const pad2 = (n: number) => numbered(n, plan.sides);
  const nodeAt = (id: string) => graph.nodes.find((n) => n.id === id)!;
  const towards = (p: { x: number; z: number }, radius: number) => ({ x: (p.x * radius) / Math.hypot(p.x, p.z), z: (p.z * radius) / Math.hypot(p.x, p.z) });
  const corridors: Sightline[] = [];
  for (let s = 0; s < plan.sides; s++) {
    const end = nodeAt(`avenue-${pad2(s + 1)}-end`);
    corridors.push({ id: `avenue-${pad2(s + 1)}`, from: end, to: towards(end, TREE_BOUGHS_RADIUS), width: plan.avenueWidth });
  }
  const fronts: Sightline[] = [];
  const streets = village.rings.filter((r) => r.street);
  /** The stretch of rule 2: from a point of the street of `ring`, level with `p`, to the avenue of its half row. */
  const walk = (id: string, ringId: string, side: number, half: -1 | 1, p: { x: number; z: number }) => {
    const k = streets.findIndex((r) => r.id === ringId) + 1;
    const ring = streets[k - 1];
    const f = sideFrame(plan, side);
    const street = (ring.street![0] + ring.street![1]) / 2;
    // Avenue `s` runs between side `s` and side `s + 1`: the clockwise half row walks to avenue `s - 1`.
    const avenue = nodeAt(`avenue-${pad2(((side + (half === 1 ? 0 : plan.sides - 1)) % plan.sides) + 1)}-street-${k}`);
    const along = p.x * f.tx + p.z * f.tz;
    fronts.push({ id, from: { x: street * f.nx + along * f.tx, z: street * f.nz + along * f.tz }, to: avenue, width: plan.streetWidth - 2 });
  };
  for (const row of village.rows) for (const plot of row.plots) walk(plot.id, row.ring, row.side, row.half, plot.front);
  for (const row of village.lotRows) for (const lot of row.lots) walk(lot.id, row.ring, row.side, row.half, lot);
  for (const site of village.sites) walk(site.id, site.ring, site.side, site.half, site.front);
  for (const p of [...village.lots.filter((lot) => lot.street === "plaza"), ...village.shops]) {
    // From just outside the line where a porch ends (4.5 u in front of the pad's centre).
    const porch = { x: p.x + 4.8 * Math.sin(p.facing), z: p.z + 4.8 * Math.cos(p.facing) };
    fronts.push({ id: p.id, from: porch, to: towards(porch, plan.ringStreet[1]), width: 0 });
  }
  return { corridors, fronts };
}
