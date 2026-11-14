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
// Village plan (IMPL-0024, PROPOSTA; the final plan is PEN-017/PEN-023).
//
// The village is a wheel around the Christmas tree: `sides` avenues leave the square between the sides of a
// polygon, and every ring of plots is a row along each side, facing the tree. A lane (pedestrian path) runs
// down the middle of every side, so each side holds two half rows. From the centre out: the square (plaza,
// ring street, festive band), the square's frontage (plots reserved for approved NGOs, DEC-028, and the
// Christmas shops) and three residential rings, one per tier.
//
// What follows the plan, and what does not:
//
// - `layoutVillage(plan)` derives the rings, the lots, the shops and billboards, the residential plots, the
//   street graph and the world radius. The belt of tall pines, the street lamps, the lane lanterns, the wood
//   yard, the dressing of the rows, the ground and the navigation grid follow the plan in force (`VILLAGE`).
// - The scenery of the square is placed by hand for the plan in force: 8 avenues, a square of 26 u, a shop
//   every two sides. The plaza lamps and benches, the three small pines, the market, the sleigh, the pond,
//   the snowmen, the critters, the quest NPCs, the quest items and the gifts do not move with the plan.
//
// So the knobs are of two kinds:
//
// - safe to turn (nothing by hand is in their way; the tests of the layout and of the walk check the result):
//   a tier's `perHalf`, `width`, `depth` and `house`, `streetWidth`, `backYard` and `edge`;
// - turn only with the scenery of the square reviewed: `sides` (`assertPlan` refuses any other number: an
//   avenue would run over what stands in the square), `plazaRadius`, `ringStreet`, `squareApothem`,
//   `avenueWidth`, `laneWidth`, `frontage` and `shopEvery`.
//
// Ids are positional (`plaza-NN`, `shop-NN`, `<tier>-NN`: the n-th place counted around the village), so
// they are stable only for an unchanged plan: another `shopEvery`, `frontage.perHalf` or tier `perHalf`
// renumbers or moves lots and plots, including the ones stored in D1 (`lots.id`, `ngos.requested_lot_id`,
// `progress_events`, quest objectives, `ngo_withdrawals.lot_ids`, audit details, `residential_plots.id`).
// Once migration 0012 is applied to a database, changing the plan needs a new migration that moves or
// renames those rows; `village.test.ts` pins the ids to their places and says so when it fails.
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
  /** Plots on each half of a side (two half rows per side, one on each side of the lane). 0 = no ring, no street. */
  perHalf: number;
  /** Plot width along the street and depth away from it (multiples of 0.5 u). */
  width: number;
  depth: number;
  house: HousePlan;
}

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
}

/**
 * The plan in force (PROPOSTA). Requirements are placeholders for the product owner to set (OQ-17): levels
 * come only from missions and quests (DEC-042), and level 3 and above need the quests, which are off in
 * production today.
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
    premium: {
      label: "Bairro do Centro",
      requirement: { kind: "level", level: 5 },
      perHalf: 1,
      width: 12,
      depth: 10,
      house: { halfWidth: 3, halfDepth: 3, porch: 1, eaves: true, offset: -1 },
    },
    standard: {
      label: "Bairro do Meio",
      requirement: { kind: "level", level: 3 },
      perHalf: 2,
      width: 9.5,
      depth: 8,
      house: { halfWidth: 3, halfDepth: 2, porch: 0.5, eaves: true, offset: -1 },
    },
    economy: {
      label: "Bairro da Floresta",
      requirement: { kind: "level", level: 2 },
      perHalf: 4,
      width: 6,
      depth: 7,
      house: { halfWidth: 2, halfDepth: 2, porch: 0, eaves: false, offset: -0.5 },
    },
  },
};

export interface LotDef {
  id: string;
  slot: number;
  x: number;
  z: number;
  /** Rotation (rad) so the lot faces the tree across the square. */
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
  /** Named spot for a future shopkeeper, beside the door, facing the square. Nothing stands there yet. */
  keeper: { x: number; z: number; rot: number };
}

/** A signage frame on a shop (PROPOSTA): shows a notice of the village; not for rent (PEN-008, OQ-18). */
export interface BillboardDef {
  id: string;
  shopId: string;
  /** Centre of the frame, on the shop's roof. The frame always faces +z, towards the camera. */
  x: number;
  y: number;
  z: number;
  /** Where the avatar stands to inspect it: at the shop's corner. */
  point: { x: number; z: number };
}

/** A residential plot (PROPOSTA, OQ-17). Mirrors a `residential_plots` row (migration 0012). */
export interface ResidentialPlot {
  id: string;
  tier: PlotTier;
  /** 1-based position inside the tier, counter-clockwise from the east side. */
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
  side: number;
  /** -1 = clockwise of the lane, +1 = counter-clockwise. */
  half: -1 | 1;
  plots: ResidentialPlot[];
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
  zone: "frontage" | PlotTier;
  /** Street-side edge of the plots and their far edge. */
  front: number;
  back: number;
  /** The street the ring faces: null for the frontage, which faces the square. */
  street: readonly [inner: number, outer: number] | null;
  /** Reach of a half row along the side, from the lane's axis. */
  reach: number;
}

export interface VillageLayout {
  plan: VillagePlan;
  worldRadius: number;
  rings: RingLayout[];
  lots: LotDef[];
  shops: ShopDef[];
  billboards: BillboardDef[];
  rows: RowDef[];
  plots: ResidentialPlot[];
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
    count(`tiers.${tier}.perHalf`, t.perHalf);
    positive(`tiers.${tier}.width`, t.width);
    positive(`tiers.${tier}.depth`, t.depth);
    count(`tiers.${tier}.house.halfWidth`, t.house.halfWidth);
    count(`tiers.${tier}.house.halfDepth`, t.house.halfDepth);
    if (!(Number.isFinite(t.house.offset) && Number.isFinite(t.house.porch))) fail(`tiers.${tier}.house needs a number for offset and porch`);
    if (!(Number.isInteger(t.requirement.level) && t.requirement.level >= 1)) fail(`tiers.${tier}.requirement.level must be a whole number from 1, got ${t.requirement.level}`);
  }
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
 * row length allow), lots, shops, billboards, residential plots and the street graph. Pure and deterministic.
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
  rings.push({ zone: "frontage", front, back: front + plan.frontage.depth, street: null, reach: frontageReach });
  for (const tier of PLOT_TIERS) {
    const t = plan.tiers[tier];
    // A tier without plots takes no room: no ring and no street.
    if (t.perHalf === 0) continue;
    const reach = plan.laneWidth / 2 + t.perHalf * t.width;
    const behind = rings[rings.length - 1].back + plan.backYard;
    front = Math.max(behind + plan.streetWidth, fits(reach));
    rings.push({ zone: tier, front, back: front + t.depth, street: [front - plan.streetWidth, front], reach });
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
      lots.push({ id: `plaza-${numbered(lots.length + 1, lotCount)}`, slot: lots.length + 1, ...centre, facing: f.facing });
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
    billboards.push({ id: `billboard-${numbered(billboards.length + 1, shopCount)}`, shopId: id, x: centre.x, y: SHOP_SIGN_HEIGHT, z: centre.z, point: at(s, frontage.front - 0.5, along - 3.4) });
  }

  // Residential rows: packed from the lane outwards, so what is left over is a verge beside the avenue.
  // Ids are positional here too: the n-th plot of the tier, counter-clockwise from the east side.
  const rows: RowDef[] = [];
  for (const tier of PLOT_TIERS) {
    const t = plan.tiers[tier];
    const ring = rings.find((r) => r.zone === tier);
    if (!ring) continue;
    const plotCount = 2 * plan.sides * t.perHalf;
    let slot = 0;
    for (let s = 0; s < plan.sides; s++) {
      const f = sideFrame(plan, s);
      for (const half of [-1, 1] as const) {
        const plots: ResidentialPlot[] = [];
        for (let i = 0; i < t.perHalf; i++) {
          // Counter-clockwise order along the side: away from the avenue on the first half, away from the lane on the second.
          const k = half === -1 ? t.perHalf - 1 - i : i;
          const along = half * (plan.laneWidth / 2 + (k + 0.5) * t.width);
          const middle = ring.front + t.depth / 2;
          slot++;
          plots.push({
            id: `${tier}-${numbered(slot, plotCount)}`,
            tier,
            slot,
            ...at(s, middle, along),
            facing: f.facing,
            width: t.width,
            depth: t.depth,
            front: at(s, ring.front - PLOT_FRONT_STEP, along),
            house: at(s, middle - t.house.offset, along),
            hearth: at(s, middle - t.house.offset + 1, along),
          });
        }
        rows.push({ tier, side: s, half, plots });
      }
    }
  }

  // Street graph: the round street of the plaza, the avenues, one polygon street per residential ring and the lanes.
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
    // and out past the last ring. With no residential ring it meets no street, so it stays out of the graph.
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

  return { plan, worldRadius, rings, lots, shops, billboards, rows, plots: rows.flatMap((r) => r.plots), graph: { nodes, edges } };
}

/** The village in force, derived from `VILLAGE_PLAN`. */
export const VILLAGE = layoutVillage(VILLAGE_PLAN);

export const WORLD_RADIUS = VILLAGE.worldRadius;
export const PLAZA_RADIUS = VILLAGE_PLAN.plazaRadius;
export const STREET_INNER = VILLAGE_PLAN.ringStreet[0];
export const STREET_OUTER = VILLAGE_PLAN.ringStreet[1];

/**
 * Lots reserved for approved NGOs (DEC-028), on the square's frontage. Mirrors the `lots` rows (migrations
 * 0002, 0003 and 0012); a test keeps them in sync. `plaza-01`…`plaza-08` existed before the expansion.
 */
export const LOTS: LotDef[] = VILLAGE.lots;
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
  { name: "Alfaiataria de Inverno", theme: "gorros, cachecóis e suéteres" },
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
];
export const billboardNotice = (billboardId: string) => VILLAGE_NOTICES[Math.max(0, BILLBOARDS.findIndex((b) => b.id === billboardId)) % VILLAGE_NOTICES.length];

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
export const PINES: [number, number][] = [
  ...PLAZA_PINES,
  ...Array.from({ length: VILLAGE_PLAN.sides }, (_, s) => {
    const f = sideFrame(VILLAGE_PLAN, s);
    const apothem = BELT.back + VILLAGE_PLAN.backYard + 3.5;
    return [-1, 1].map((half): [number, number] => {
      const along = half * Math.min(BELT.reach * 0.55, 9);
      return [roundAway(apothem * f.nx + along * f.tx), roundAway(apothem * f.nz + along * f.tz)];
    });
  }).flat(),
];
/** Pine size by index: the three by the plaza stay small so they never hide the avatar from the camera. */
export const pineIsTall = (i: number): boolean => i >= PLAZA_PINES.length;
/** Where a pine stands: the drawn model and its collider both snap to whole voxels. */
export const pineAt = ([x, z]: readonly [number, number]): Placed => ({ x: Math.round(x), z: Math.round(z) });

/** Decorative forest outside the walkable radius (no collision; frames the village). */
export const FOREST_INNER = WORLD_RADIUS + 4;
export const FOREST_OUTER = WORLD_RADIUS + 30;

/**
 * The lumberjack's wood yard (PROPOSTA, a later phase): a named spot at the end of the northern lane, by
 * the forest. Only a pile of logs stands there today; the firewood quest is not built.
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
  // On the round street, beside the north-east avenue (it used to stand where the avenue now enters the square).
  { kind: "villager", seed: "villager-3", x: 14.6, z: -2.6, rot: -1.1 },
  { kind: "cat", seed: "cat-1", x: 7.6, z: 8.3, y: 1, rot: -2.3 },
  { kind: "bird", seed: "bird-1", x: 12.2, z: 0, y: 4.5, rot: Math.PI },
  { kind: "bird", seed: "bird-2", x: -12.2, z: 0, y: 4.5, rot: 0 },
  { kind: "rabbit", seed: "rabbit-1", x: 23.5, z: -2.8, rot: 2.5 },
  // Perched on the top of a tall pine of the belt (2 u of trunk and nine layers of boughs).
  { kind: "owl", seed: "owl-1", x: PINES[PLAZA_PINES.length][0], z: PINES[PLAZA_PINES.length][1], y: 11, rot: -2.5 },
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
];

export const LAMPS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (2 * Math.PI * i) / 8;
  return [Math.round(12.2 * Math.cos(a) * 100) / 100, Math.round(12.2 * Math.sin(a) * 100) / 100];
});

/** Benches on the plaza side of every other lamp post, lengthwise along the ring. */
export const BENCHES: Required<Placed>[] = LAMPS.filter((_, i) => i % 2 === 1).map(([x, z]) => ({ x: x * 0.92, z: z * 0.92, rot: Math.atan2(x, z) }));

/**
 * Street lamps at the corners where the avenues cross the ring streets, on the verge behind the inner row
 * (same model as the plaza lamps). The lamp style is one of the cues of a tier: both corners of every side
 * on the premium street, one on the standard street, none on the economy street (its cottages carry a
 * lantern on a stake instead).
 */
export const STREET_LAMPS: [number, number][] = VILLAGE.rings.flatMap((ring) => {
  if (!ring.street || ring.zone === "economy") return [];
  const apothem = ring.street[0] - 0.75;
  const reach = apothem * Math.tan(Math.PI / VILLAGE_PLAN.sides) - avenueCut(VILLAGE_PLAN) - 0.9;
  return Array.from({ length: VILLAGE_PLAN.sides }, (_, s) => {
    const f = sideFrame(VILLAGE_PLAN, s);
    return (ring.zone === "premium" ? [-1, 1] : [1]).map((half): [number, number] => [round2(apothem * f.nx + half * reach * f.tx), round2(apothem * f.nz + half * reach * f.tz)]);
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
  const w = tier.width, d = tier.depth;
  const wallHalf = tier.house.halfWidth + 0.5, wallDepth = 2 * tier.house.halfDepth + 1;
  const gap = Math.round((w - 2 * wallHalf) / v);
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
      part(plot, row.tier === "standard" ? "hedge" : "firewood", wallHalf + v / 2, tier.house.offset - wallDepth / 2 + v / 2, gap, Math.round(wallDepth / v));
    }
  });
  return out;
}
/** Every dressing part of the residential rows, in the order of `RESIDENTIAL_ROWS`. */
export const RESIDENTIAL_DRESSING: DressingPart[] = RESIDENTIAL_ROWS.flatMap(rowDressing);

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
  ...CRITTERS.flatMap((c) => {
    const s = CRITTER_SOLID[c.kind];
    return s && (c.y ?? 0) < HEAD_HEIGHT ? [solid(c, s)] : [];
  }),
  ...SHOPS.flatMap((shop) => SHOP_SOLID.map(([x0, x1, z0, z1]) => footprint({ x: shop.x, z: shop.z, rot: shop.facing }, x0, x1, z0, z1))),
  ...RESIDENTIAL_DRESSING.map((part) => solid(part, part.solid)),
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
export type GroundKind = "ice" | "plaza" | "ring-street" | "avenue" | "lane" | `street-${PlotTier}` | `path-${PlotTier}` | `yard-${PlotTier}` | "pad" | "snow";

const TWO_PI = Math.PI * 2;

/**
 * What the ground is at a point (IMPL-0024): the same function paints the voxel ground and picks the footstep
 * sound. Paving is one of the cues of a tier: cobbles on the premium street and a stone path to each door,
 * packed snow on the standard street, trodden snow on the economy street.
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
    for (const ring of VILLAGE.rings) if (ring.street && apothem >= ring.street[0] && apothem <= ring.street[1]) return `street-${ring.zone as PlotTier}`;
    return "lane";
  }
  for (const ring of VILLAGE.rings) {
    if (ring.street && apothem >= ring.street[0] && apothem <= ring.street[1]) return `street-${ring.zone as PlotTier}`;
    if (apothem < ring.front || apothem > ring.back || Math.abs(along) > ring.reach) continue;
    if (ring.zone === "frontage") {
      const centre = plan.laneWidth / 2 + (Math.floor((Math.abs(along) - plan.laneWidth / 2) / plan.frontage.width) + 0.5) * plan.frontage.width;
      return Math.abs(Math.abs(along) - centre) <= 3.5 && apothem >= ring.front + 1 ? "pad" : "snow";
    }
    const tier = plan.tiers[ring.zone];
    const centre = plan.laneWidth / 2 + (Math.floor((Math.abs(along) - plan.laneWidth / 2) / tier.width) + 0.5) * tier.width;
    const door = ring.front + tier.depth / 2 - tier.house.offset - tier.house.halfDepth - 0.5;
    if (ring.zone !== "economy" && Math.abs(Math.abs(along) - centre) <= 1 && apothem <= door) return `path-${ring.zone}`;
    return `yard-${ring.zone}`;
  }
  return "snow";
}

export type Surface = "stone" | "packed" | "snow" | "ice";

/** Ground material under a point (footstep sound, snow kick-up). Mirrors the ground layout. */
export function surfaceAt(x: number, z: number): Surface {
  const kind = groundAt(x, z);
  if (kind === "ice") return "ice";
  if (kind === "plaza" || kind === "street-premium" || kind === "path-premium" || kind === "pad") return "stone";
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
 * 2. Plots. The walk along the street from the front of a residential plot to the avenue of its half row is
 *    at most `maxWalk` long. That stretch holding no tall thing is checked too, but it follows from the
 *    layout (nothing is ever placed on a street), so only the length says something about a plan.
 * 3. Frontage. No tall thing stands between the porch line of a lot or a shop and the round street of the
 *    plaza, on the line towards the tree. It also follows from the layout (the band between them holds only
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

/** The avenue corridors (rule 1) and, per plot, lot and shop, the stretches of rules 2 and 3. */
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
  for (const row of village.rows) {
    const k = streets.findIndex((r) => r.zone === row.tier) + 1;
    const ring = streets[k - 1];
    const f = sideFrame(plan, row.side);
    const street = (ring.street![0] + ring.street![1]) / 2;
    // Avenue `s` runs between side `s` and side `s + 1`: the clockwise half row walks to avenue `s - 1`.
    const avenue = nodeAt(`avenue-${pad2(((row.side + (row.half === 1 ? 0 : plan.sides - 1)) % plan.sides) + 1)}-street-${k}`);
    for (const plot of row.plots) {
      const along = plot.front.x * f.tx + plot.front.z * f.tz;
      fronts.push({ id: plot.id, from: { x: street * f.nx + along * f.tx, z: street * f.nz + along * f.tz }, to: avenue, width: plan.streetWidth - 2 });
    }
  }
  for (const p of [...village.lots, ...village.shops]) {
    // From just outside the line where a porch ends (4.5 u in front of the pad's centre).
    const porch = { x: p.x + 4.8 * Math.sin(p.facing), z: p.z + 4.8 * Math.cos(p.facing) };
    fronts.push({ id: p.id, from: porch, to: towards(porch, plan.ringStreet[1]), width: 0 });
  }
  return { corridors, fronts };
}
