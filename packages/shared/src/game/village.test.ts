/**
 * The village plan (IMPL-0024, PROPOSTA). `layoutVillage` derives the layout from `VILLAGE_PLAN`; these are the
 * rules it must keep. The plan in force is checked whole: geometry, ids pinned to their places, the seed of
 * migration 0012, colliders and navigation. Other plans are checked for the layout's own geometry only: the
 * scenery of the square, the colliders and the navigation grid exist for the plan in force and no other.
 */
import { describe, expect, it } from "vitest";

import seed from "../../../../migrations/0012_village_expansion.sql?raw";

import { AVATAR_RADIUS, clearance, type Collider, distanceTo, footprint } from "./collision";
import { createBody, MOTION, STEP } from "./motion";
import { createNavField, createRoute, isOpen, lineClear, planRoute, stepWalk } from "./navigation";
import {
  assertPlan,
  BILLBOARDS,
  GIFTS,
  HOUSE_ENVELOPE,
  houseEnvelope,
  INTERACT_DISTANCE,
  layoutVillage,
  lotColliders,
  lotFront,
  LOTS,
  NPCS,
  OBSTACLES,
  PATH_GRAPH,
  pineAt,
  pineIsTall,
  PINES,
  PLOT_FRONT_STEP,
  PLOT_TIERS,
  plotColliders,
  QUEST_INTERACTIONS,
  QUEST_OBSTACLES,
  QUEST_SPAWNS,
  RESIDENTIAL_DRESSING,
  RESIDENTIAL_PLOTS,
  SCENERY_SIDES,
  SHOP_SOLID,
  SHOPS,
  SIGHTLINE,
  sightlines,
  SPAWN,
  TREE_KEEP_OUT,
  VILLAGE,
  VILLAGE_PLAN,
  type VillageLayout,
  type VillagePlan,
  sideFrame,
  WOOD_YARD,
  WORLD_RADIUS,
} from "./world";

/** A plot, lot or shop as a rectangle on the ground: `[x0, x1, z0, z1]` around `at`, turned by `at.rot`. */
interface Parcel {
  id: string;
  rect: Collider;
}

const parcels = (v: VillageLayout): Parcel[] => [
  ...v.plots.map((p) => ({ id: p.id, rect: footprint({ x: p.x, z: p.z, rot: p.facing }, -p.width / 2, p.width / 2, -p.depth / 2, p.depth / 2) })),
  // A lot or a shop: the 7 × 7 pad and the 1 u in front of it where a porch may stand.
  ...[...v.lots, ...v.shops].map((l) => ({ id: l.id, rect: footprint({ x: l.x, z: l.z, rot: l.facing }, -3.5, 3.5, -3.5, 4.5) })),
];

/** The four corners of a rectangle collider (`r` = 0). */
function corners(c: Collider): Array<[number, number]> {
  const ux = c.ux ?? 1, uz = c.uz ?? 0, hx = c.hx ?? 0, hz = c.hz ?? 0;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c.x + a * hx * ux - b * hz * uz, c.z + a * hx * uz + b * hz * ux]);
}

/** Overlap of two rectangles (separating axes). Positions are stored with two decimals: `slack` forgives that. */
function overlap(a: Collider, b: Collider, slack = 0.02): boolean {
  const pa = corners(a), pb = corners(b);
  for (const c of [a, b]) {
    const ux = c.ux ?? 1, uz = c.uz ?? 0;
    for (const [ax, az] of [[ux, uz], [-uz, ux]]) {
      const span = (pts: Array<[number, number]>) => pts.map(([x, z]) => x * ax + z * az);
      const sa = span(pa), sb = span(pb);
      if (Math.max(...sa) <= Math.min(...sb) + slack || Math.max(...sb) <= Math.min(...sa) + slack) return false;
    }
  }
  return true;
}

/** What blocks a view (see `SIGHTLINE`): chalets of plots and lots, shops, and (for the plan in force) the pines. */
function tall(v: VillageLayout, pines: boolean): Collider[] {
  return [
    ...v.plots.flatMap((p) => houseEnvelope(p.tier, v.plan).map(([x0, x1, z0, z1]) => footprint({ x: p.house.x, z: p.house.z, rot: p.facing }, x0, x1, z0, z1))),
    ...v.lots.flatMap((l) => HOUSE_ENVELOPE.map(([x0, x1, z0, z1]) => footprint({ x: l.x, z: l.z, rot: l.facing }, x0, x1, z0, z1))),
    ...v.shops.flatMap((s) => SHOP_SOLID.map(([x0, x1, z0, z1]) => footprint({ x: s.x, z: s.z, rot: s.facing }, x0, x1, z0, z1))),
    ...(pines ? PINES.map((p, i) => ({ ...pineAt(p), r: pineIsTall(i) ? 3.2 : 2.2 })) : []),
  ];
}

/** Points along a segment, every 0.5 u. */
function along(from: { x: number; z: number }, to: { x: number; z: number }): Array<[number, number]> {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5));
  return Array.from({ length: n + 1 }, (_, i) => [from.x + ((to.x - from.x) * i) / n, from.z + ((to.z - from.z) * i) / n]);
}

/** Every rule that depends only on the geometry: checked for the plan in force and for the variants. */
function invariants(v: VillageLayout, pines: boolean, maxWalk: number = SIGHTLINE.maxWalk): string[] {
  const wrong: string[] = [];
  const { plan } = v;

  // Ids: unique across everything that has one.
  const ids = [...v.lots, ...v.shops, ...v.billboards, ...v.plots, ...v.graph.nodes].map((x) => x.id);
  if (new Set(ids).size !== ids.length) wrong.push("duplicate ids");

  // Counts follow the plan.
  const halves = 2 * plan.sides;
  const shops = plan.shopEvery > 0 ? Math.ceil(plan.sides / plan.shopEvery) : 0;
  if (v.shops.length !== shops || v.billboards.length !== shops) wrong.push(`shops ${v.shops.length}, billboards ${v.billboards.length}, expected ${shops}`);
  if (v.lots.length !== halves * plan.frontage.perHalf - shops) wrong.push(`lots ${v.lots.length}`);
  for (const tier of PLOT_TIERS) {
    const n = v.plots.filter((p) => p.tier === tier).length;
    if (n !== halves * plan.tiers[tier].perHalf) wrong.push(`${tier} plots ${n}`);
  }
  if (v.lots.some((l, i) => l.slot !== i + 1) || PLOT_TIERS.some((t) => v.plots.filter((p) => p.tier === t).some((p, i) => p.slot !== i + 1))) wrong.push("slots are not 1..n");

  // Tiers follow the distance from the tree: the frontage, then premium, standard and economy, without overlap.
  const reach = (list: Array<{ x: number; z: number }>) => [Math.min(...list.map((p) => Math.hypot(p.x, p.z))), Math.max(...list.map((p) => Math.hypot(p.x, p.z)))];
  const bands = [reach([...v.lots, ...v.shops]), ...PLOT_TIERS.map((t) => reach(v.plots.filter((p) => p.tier === t)))];
  for (let i = 1; i < bands.length; i++) if (bands[i][0] <= bands[i - 1][1]) wrong.push(`ring ${i} starts at ${bands[i][0].toFixed(1)}, inside ring ${i - 1} (${bands[i - 1][1].toFixed(1)})`);
  for (let i = 1; i < v.rings.length; i++) if (v.rings[i].front < v.rings[i - 1].back + plan.backYard + plan.streetWidth - 1e-9) wrong.push(`ring ${i} leaves no room for its street`);
  // A tier without plots reserves nothing: one ring (and one street) per tier that has plots, after the frontage.
  const zones = ["frontage", ...PLOT_TIERS.filter((t) => plan.tiers[t].perHalf > 0)];
  if (v.rings.map((r) => r.zone).join() !== zones.join()) wrong.push(`rings ${v.rings.map((r) => r.zone).join()}, expected ${zones.join()}`);
  // Ids of a kind share one width, so they sort and match `<kind>-<digits>` whatever the count.
  for (const kind of ["plaza", "shop", "billboard", ...PLOT_TIERS]) {
    const widths = new Set(ids.filter((id) => new RegExp(`^${kind}-\\d+$`).test(id)).map((id) => id.length));
    if (widths.size > 1) wrong.push(`${kind} ids have ${widths.size} different widths`);
  }

  // Nothing overlaps: no plot, lot or shop over another one.
  const all = parcels(v);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      if (Math.hypot(all[i].rect.x - all[j].rect.x, all[i].rect.z - all[j].rect.z) > 30) continue;
      if (overlap(all[i].rect, all[j].rect)) wrong.push(`${all[i].id} overlaps ${all[j].id}`);
    }

  // Everything is inside the world, and the tree stays the centre: the nearest plot is beyond the round street.
  for (const p of all) for (const [x, z] of corners(p.rect)) if (Math.hypot(x, z) > v.worldRadius - 1) wrong.push(`${p.id} reaches the edge of the world`);
  if (bands[0][0] < plan.ringStreet[1] + 3.5) wrong.push("the frontage stands on the round street");

  // No plot, lot or shop stands on a street: the whole width of every avenue, street and lane is free.
  const node = new Map(v.graph.nodes.map((n) => [n.id, n]));
  for (const e of v.graph.edges) {
    if (e.kind === "plaza") continue;
    const a = node.get(e.a)!, b = node.get(e.b)!;
    const len = Math.hypot(b.x - a.x, b.z - a.z), px = -(b.z - a.z) / len, pz = (b.x - a.x) / len;
    const crossed = new Set<string>();
    for (const [x, z] of along(a, b))
      for (const side of [-1, 0, 1]) {
        const sx = x + (side * px * e.width) / 2, sz = z + (side * pz * e.width) / 2;
        const hit = all.find((p) => distanceTo(p.rect, sx, sz) < -0.02);
        if (hit) crossed.add(hit.id);
      }
    for (const id of crossed) wrong.push(`${e.kind} ${e.a} → ${e.b} crosses ${id}`);
  }

  // The street graph is one piece, and every plot, lot and shop fronts one of its streets.
  const seen = new Set([v.graph.nodes[0].id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of v.graph.edges) if (seen.has(e.a) !== seen.has(e.b)) (seen.add(e.a), seen.add(e.b), (grew = true));
  }
  if (seen.size !== v.graph.nodes.length) wrong.push(`the street graph has ${v.graph.nodes.length - seen.size} node(s) cut off`);
  const toStreets = (x: number, z: number) => {
    let best = Infinity;
    for (const e of v.graph.edges) {
      const a = node.get(e.a)!, b = node.get(e.b)!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz) - e.width / 2);
    }
    return best;
  };
  for (const p of v.plots) if (toStreets(p.front.x, p.front.z) > 0.05) wrong.push(`${p.id} does not front a street`);

  // Each plot: the front is a step into the street from its edge, the chalet and its fireplace stay on the plot.
  for (const p of v.plots) {
    const rect = all.find((a) => a.id === p.id)!.rect;
    if (Math.abs(distanceTo(rect, p.front.x, p.front.z) - PLOT_FRONT_STEP) > 0.02) wrong.push(`${p.id}: front is not a step from its edge`);
    if (Math.hypot(p.front.x, p.front.z) >= Math.hypot(p.x, p.z)) wrong.push(`${p.id}: does not face the tree`);
    const walls = houseEnvelope(p.tier, plan).map(([x0, x1, z0, z1]) => footprint({ x: p.house.x, z: p.house.z, rot: p.facing }, x0, x1, z0, z1));
    for (const w of walls) for (const [x, z] of corners(w)) if (distanceTo(rect, x, z) > 0.02) wrong.push(`${p.id}: chalet leaves the plot`);
    if (distanceTo(walls[0], p.hearth.x, p.hearth.z) > -0.5) wrong.push(`${p.id}: fireplace outside the walls`);
  }

  // Sightlines (SIGHTLINE), each rule as stated there: rule 1 is the avenue corridors; rules 2 and 3 cannot be
  // broken by a tall thing as long as the layout keeps its streets and the band of the square free (checked
  // above), so for them the length limit of rule 2 is what tells plans apart.
  const blockers = tall(v, pines);
  const { corridors, fronts } = sightlines(v);
  if (corridors.length !== plan.sides || fronts.length !== all.length) wrong.push("a sightline is missing");
  for (const line of [...corridors, ...fronts]) {
    if (Math.hypot(line.to.x - line.from.x, line.to.z - line.from.z) > (line.id.startsWith("avenue") ? Infinity : maxWalk)) wrong.push(`${line.id}: the avenue is more than ${maxWalk} u away`);
    for (const [x, z] of along(line.from, line.to)) {
      const hit = blockers.find((c) => distanceTo(c, x, z) < line.width / 2 + SIGHTLINE.margin);
      if (hit) {
        wrong.push(`${line.id}: view blocked at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        break;
      }
    }
  }
  return wrong;
}

describe("village plan in force (IMPL-0024, PROPOSTA)", () => {
  it("keeps every rule of the layout", () => {
    expect(invariants(VILLAGE, true)).toEqual([]);
  });

  it("derives these numbers from VILLAGE_PLAN", () => {
    expect(WORLD_RADIUS).toBe(82.5);
    expect(VILLAGE.rings.map((r) => [r.zone, r.front, r.back])).toEqual([["frontage", 26, 34], ["premium", 39.5, 49.5], ["standard", 55, 63], ["economy", 68.5, 75.5]]);
    expect([LOTS.length, SHOPS.length, BILLBOARDS.length]).toEqual([12, 4, 4]);
    expect(PLOT_TIERS.map((t) => RESIDENTIAL_PLOTS.filter((p) => p.tier === t).length)).toEqual([16, 32, 64]);
    // The eight lots that existed before keep their ids, and now face the tree from the square's frontage.
    expect(LOTS.slice(0, 8).map((l) => l.id)).toEqual(["plaza-01", "plaza-02", "plaza-03", "plaza-04", "plaza-05", "plaza-06", "plaza-07", "plaza-08"]);
    expect(LOTS.slice(8).map((l) => l.id)).toEqual(["plaza-09", "plaza-10", "plaza-11", "plaza-12"]);
    expect(SHOPS.map((s) => s.id)).toEqual(["shop-01", "shop-02", "shop-03", "shop-04"]);
    expect(BILLBOARDS.map((b) => [b.id, b.shopId])).toEqual([["billboard-01", "shop-01"], ["billboard-02", "shop-02"], ["billboard-03", "shop-03"], ["billboard-04", "shop-04"]]);
    expect([RESIDENTIAL_PLOTS[0].id, RESIDENTIAL_PLOTS[16].id, RESIDENTIAL_PLOTS[48].id, RESIDENTIAL_PLOTS[111].id]).toEqual(["premium-01", "standard-01", "economy-01", "economy-64"]);
    const length = (kind: string) => Math.round(PATH_GRAPH.edges.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.length, 0));
    expect([length("plaza"), length("avenue"), length("street"), length("lane")]).toEqual([92, 532, 1041, 424]);
  });

  /** Said by the two tests below when they fail. */
  const POSITIONAL =
    "ids are positional and stored in D1 (lots.id, ngos.requested_lot_id, progress_events, quest objectives, ngo_withdrawals.lot_ids, audit details, residential_plots.id): " +
    "a plan that moves or renumbers a lot or a plot needs, once migration 0012 is applied, a new migration that moves or renames those rows (IMPL-0024, OQ-19). Do not update this table without one.";
  /** Side of the village a point is on, and the half of that side (+1 = counter-clockwise of the lane). */
  const placeOf = (p: { x: number; z: number }) => {
    const side = ((Math.round(Math.atan2(p.z, p.x) / ((2 * Math.PI) / VILLAGE_PLAN.sides)) % VILLAGE_PLAN.sides) + VILLAGE_PLAN.sides) % VILLAGE_PLAN.sides;
    const f = sideFrame(VILLAGE_PLAN, side);
    return [side, Math.sign(p.x * f.tx + p.z * f.tz)];
  };

  it("pins every lot of the square to its side, its half and its coordinates", () => {
    expect(LOTS.map((l) => [l.id, ...placeOf(l), l.x, l.z]), POSITIONAL).toEqual([
      ["plaza-01", 0, 1, 30.5, 5],
      ["plaza-02", 1, 1, 18.03, 25.1],
      ["plaza-03", 2, 1, -5, 30.5],
      ["plaza-04", 3, 1, -25.1, 18.03],
      ["plaza-05", 4, 1, -30.5, -5],
      ["plaza-06", 5, 1, -18.03, -25.1],
      ["plaza-07", 6, 1, 5, -30.5],
      ["plaza-08", 7, 1, 25.1, -18.03],
      ["plaza-09", 1, -1, 25.1, 18.03],
      ["plaza-10", 3, -1, -18.03, 25.1],
      ["plaza-11", 5, -1, -25.1, -18.03],
      ["plaza-12", 7, -1, 18.03, -25.1],
    ]);
    expect(SHOPS.map((shop) => [shop.id, ...placeOf(shop), shop.x, shop.z]), POSITIONAL).toEqual([
      ["shop-01", 0, -1, 30.5, -5],
      ["shop-02", 2, -1, 5, 30.5],
      ["shop-03", 4, -1, -30.5, 5],
      ["shop-04", 6, -1, -5, -30.5],
    ]);
  });

  it("pins the first and the last plot of every residential tier to their coordinates", () => {
    const ends = PLOT_TIERS.map((tier) => {
      const plots = RESIDENTIAL_PLOTS.filter((p) => p.tier === tier);
      return [plots[0], plots[plots.length - 1]].map((p) => [p.id, ...placeOf(p), p.x, p.z]);
    });
    expect(ends, POSITIONAL).toEqual([
      [["premium-01", 0, -1, 44.5, -7.5], ["premium-16", 7, 1, 36.77, -26.16]],
      [["standard-01", 0, -1, 59, -15.75], ["standard-32", 7, 1, 52.86, -30.58]],
      [["economy-01", 0, -1, 72, -22.5], ["economy-64", 7, 1, 66.82, -35]],
    ]);
  });

  it("numbers ids with two digits today, and with as many as the largest count needs", () => {
    for (const id of [...LOTS, ...SHOPS, ...BILLBOARDS, ...RESIDENTIAL_PLOTS].map((x) => x.id)) expect(id).toMatch(/^[a-z]+-\d\d$/);
    const plan = JSON.parse(JSON.stringify(VILLAGE_PLAN)) as VillagePlan;
    plan.tiers.economy.perHalf = 7;
    const economy = layoutVillage(plan).plots.filter((p) => p.tier === "economy").map((p) => p.id);
    expect([economy.length, economy[0], economy[98], economy[99], economy[111]]).toEqual([112, "economy-001", "economy-099", "economy-100", "economy-112"]);
    // One width: the ids sort in slot order and keep the `<tier>-<digits>` form.
    expect([...economy].sort()).toEqual(economy);
    // The other tiers of that plan keep their two digits.
    expect(layoutVillage(plan).plots.filter((p) => p.tier === "premium").map((p) => p.id)).toEqual(RESIDENTIAL_PLOTS.filter((p) => p.tier === "premium").map((p) => p.id));
  });

  it("asks a requirement of each tier, never a price (PROPOSTA, OQ-17)", () => {
    for (const tier of PLOT_TIERS) {
      const t = VILLAGE_PLAN.tiers[tier];
      expect(t.requirement.kind).toBe("level");
      expect(Number.isInteger(t.requirement.level) && t.requirement.level >= 1).toBe(true);
      expect(Object.keys(t).sort()).toEqual(["depth", "house", "label", "perHalf", "requirement", "width"]);
    }
    // Nearer the tree asks more.
    const [premium, standard, economy] = PLOT_TIERS.map((t) => VILLAGE_PLAN.tiers[t].requirement.level);
    expect(premium).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(economy);
  });

  it("matches the seed of migration 0012: the moved lots, the new lots and every residential plot", () => {
    for (const lot of LOTS)
      expect(seed, lot.id).toContain(lot.slot <= 8 ? `UPDATE lots SET x = ${lot.x}, z = ${lot.z} WHERE id = '${lot.id}';` : `('${lot.id}', 'plaza', ${lot.slot}, ${lot.x}, ${lot.z})`);
    expect(seed.match(/UPDATE lots SET/g)).toHaveLength(8);
    expect(seed.match(/\('plaza-\d\d', 'plaza',/g)).toHaveLength(LOTS.length - 8);
    for (const p of RESIDENTIAL_PLOTS) expect(seed, p.id).toContain(`('${p.id}', '${p.tier}', ${p.slot}, ${p.x}, ${p.z}, ${p.facing})`);
    expect(seed.match(/\('(premium|standard|economy)-\d+', /g)).toHaveLength(RESIDENTIAL_PLOTS.length);
    // No price anywhere: the table has no amount, currency or price column.
    expect(/price|amount|currency|coin|R\$/i.test(seed.replace(/--.*$/gm, ""))).toBe(false);
  });
});

describe("village on foot (IMPL-0016 over the plan in force)", () => {
  const colliders = [...OBSTACLES, ...RESIDENTIAL_PLOTS.flatMap((p) => plotColliders(p)), ...LOTS.flatMap((l) => lotColliders(l, HOUSE_ENVELOPE))];
  const field = createNavField(colliders);
  const places = [
    ...RESIDENTIAL_PLOTS.map((p) => ({ id: p.id, ...p.front })),
    ...SHOPS.map((s) => ({ id: s.id, ...s.door })),
    ...BILLBOARDS.map((b) => ({ id: b.id, ...b.point })),
    { id: "wood-yard", x: WOOD_YARD.x, z: WOOD_YARD.z + 2 },
  ];

  it("keeps the street graph on open ground: every node is walkable and every edge is a clear walk", () => {
    const node = new Map(PATH_GRAPH.nodes.map((n) => [n.id, n]));
    for (const n of PATH_GRAPH.nodes) expect(isOpen(field, n.x, n.z), n.id).toBe(true);
    for (const e of PATH_GRAPH.edges) {
      if (e.kind === "plaza") continue; // the round street is an arc: its chord cuts the plaza's lamps
      const a = node.get(e.a)!, b = node.get(e.b)!;
      expect(lineClear(field, a.x, a.z, b.x, b.z), `${e.a} → ${e.b}`).toBe(true);
    }
  });

  it("passes the full collider and navigation audit, with empty lots and with every chalet and the quests", () => {
    const homes = RESIDENTIAL_PLOTS.flatMap((p) => plotColliders(p));
    const configs: Array<[string, Collider[]]> = [
      ["every lot available, quests off", [...OBSTACLES, ...homes, ...LOTS.flatMap((l) => lotColliders(l, null))]],
      ["every lot with a chalet, quests on", [...OBSTACLES, ...QUEST_OBSTACLES, ...homes, ...LOTS.flatMap((l) => lotColliders(l, HOUSE_ENVELOPE))]],
    ];
    /** Where the avatar stands: each must be open ground the planner reaches exactly. */
    const stands = [
      { id: "spawn", x: SPAWN.x, z: SPAWN.z },
      ...places,
      ...SHOPS.map((shop) => ({ id: `${shop.id} keeper`, x: shop.keeper.x, z: shop.keeper.z })),
      ...LOTS.map((l) => ({ id: `${l.id} front`, ...lotFront(l) })),
      ...PATH_GRAPH.nodes,
    ];
    /** What the avatar walks up to: a walkable point within reach of each. */
    const reaches = [
      ...GIFTS.map((g) => ({ id: g.id, x: g.x, z: g.z, reach: 1 })),
      ...QUEST_SPAWNS.map((q) => ({ id: q.id, x: q.x, z: q.z, reach: 1 })),
      ...QUEST_INTERACTIONS.map((q) => ({ id: q.id, x: q.x, z: q.z, reach: q.radius })),
      ...NPCS.map((n) => ({ id: n.id, x: n.x, z: n.z, reach: INTERACT_DISTANCE })),
    ];
    const node = new Map(PATH_GRAPH.nodes.map((n) => [n.id, n]));
    for (const [name, set] of configs) {
      const nav = createNavField(set);
      const route = createRoute();
      const wrong: string[] = [];
      for (const p of stands) {
        if (!isOpen(nav, p.x, p.z)) wrong.push(`${p.id}: not open ground (clearance ${clearance(set, p.x, p.z).toFixed(2)})`);
        planRoute(nav, route, -57, 57, p.x, p.z);
        if (route.direct || route.x !== p.x || route.z !== p.z) wrong.push(`${p.id}: not reached exactly`);
      }
      for (const p of reaches) {
        planRoute(nav, route, SPAWN.x, SPAWN.z, p.x, p.z);
        if (route.direct || Math.hypot(route.x - p.x, route.z - p.z) >= p.reach) wrong.push(`${p.id}: no walkable point within ${p.reach} u`);
      }
      // Streets: the axis of every avenue, street and lane is a clear walk, and nothing solid stands on its
      // paving: the avatar's body fits from edge to edge, but for the 0.25 u a fence on a plot's boundary takes
      // (half a dressing voxel). Positions are stored with two decimals: 0.02 forgives that.
      for (const e of PATH_GRAPH.edges) {
        if (e.kind === "plaza") continue;
        const a = node.get(e.a)!, b = node.get(e.b)!;
        if (!lineClear(nav, a.x, a.z, b.x, b.z)) wrong.push(`${e.a} → ${e.b}: the axis is not a clear walk`);
        const len = Math.hypot(b.x - a.x, b.z - a.z), px = -(b.z - a.z) / len, pz = (b.x - a.x) / len;
        const half = e.width / 2 - 0.25 - AVATAR_RADIUS;
        const hit = along(a, b).flatMap(([x, z]) => [-1, -0.5, 0.5, 1].map((side) => [x + side * half * px, z + side * half * pz])).find(([x, z]) => clearance(set, x, z) < -0.02);
        if (hit) wrong.push(`${e.a} → ${e.b}: something solid stands on the paving at (${hit[0].toFixed(1)}, ${hit[1].toFixed(1)})`);
      }
      // No walkable pocket is cut off: what is left outside the walkable region is a few stray cells.
      const pockets = nav.regionSizes.filter((_, id) => id !== nav.main);
      if (Math.max(0, ...pockets) > 4) wrong.push(`a pocket of ${Math.max(...pockets)} cells is cut off from the village`);
      expect(wrong, name).toEqual([]);
    }
  });

  it("plants the belt of tall pines the same on every side: mirrored east–west, north–south and across the diagonal", () => {
    // `Math.round` sends 80.5 to 81 and -80.5 to -80: the belt stood one unit nearer on the west and on the north.
    const belt = PINES.filter((_, i) => pineIsTall(i));
    expect(belt).toHaveLength(2 * VILLAGE_PLAN.sides);
    const key = ([x, z]: readonly [number, number]) => `${x},${z}`;
    const set = new Set(belt.map(key));
    for (const [x, z] of belt) {
      expect(set.has(key([-x, z])), `mirror of (${x}, ${z}) across x`).toBe(true);
      expect(set.has(key([x, -z])), `mirror of (${x}, ${z}) across z`).toBe(true);
      expect(set.has(key([z, x])), `mirror of (${x}, ${z}) across the diagonal`).toBe(true);
    }
    expect(new Set(belt.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))))).toEqual(new Set([81, 63]));
  });

  it("keeps the shopkeepers' spots, the shop doors and the billboard points free", () => {
    for (const s of SHOPS) {
      expect(isOpen(field, s.door.x, s.door.z), `${s.id} door`).toBe(true);
      expect(isOpen(field, s.keeper.x, s.keeper.z), `${s.id} keeper`).toBe(true);
      expect(Math.hypot(s.keeper.x - s.door.x, s.keeper.z - s.door.z), `${s.id} keeper beside the door`).toBeLessThan(3);
    }
    for (const b of BILLBOARDS) expect(isOpen(field, b.point.x, b.point.z), b.id).toBe(true);
  });

  it("reaches every plot front, shop door and billboard from another one, across the village", () => {
    const route = createRoute();
    places.forEach((from, i) => {
      // A fixed permutation: each place plans a walk to one far from it in the list (other tier, other side).
      const to = places[(i * 37 + 53) % places.length];
      planRoute(field, route, from.x, from.z, to.x, to.z);
      expect([route.x, route.z, route.direct], `${from.id} → ${to.id}`).toEqual([to.x, to.z, false]);
    });
    // And walks a few of them for real, the longest ones included.
    const walks = [[0, places.length - 1], [47, 100], [111, 16], [60, 113]];
    for (const [i, j] of walks) {
      const b = createBody(places[i].x, places[i].z);
      planRoute(field, route, b.x, b.z, places[j].x, places[j].z);
      let arrived = false;
      for (let n = 0; n < 60 / STEP && !arrived; n++) arrived = stepWalk(b, route, field, colliders).arrived;
      expect(arrived, `${places[i].id} → ${places[j].id}`).toBe(true);
      expect(route.replans, `${places[i].id} → ${places[j].id}`).toBe(0);
    }
  });

  it("walks from the farthest plot of each tier to the tree in the documented time", () => {
    // The numbers of the ADR (IMPL-0024 §1): the farthest front of each tier, a planned walk to the tree at
    // 8.5 u/s on the fixed 60 Hz step, every lot with a chalet. Length = planned route; time = steps walked.
    const measured = PLOT_TIERS.map((tier) => {
      const far = RESIDENTIAL_PLOTS.filter((p) => p.tier === tier).reduce((a, b) => (Math.hypot(b.front.x, b.front.z) > Math.hypot(a.front.x, a.front.z) + 1e-9 ? b : a));
      const b = createBody(far.front.x, far.front.z), route = createRoute();
      planRoute(field, route, b.x, b.z, 0, 0);
      const length = Math.hypot(route.xs[0] - b.x, route.zs[0] - b.z) + route.rest[0];
      let steps = 0, arrived = false;
      for (; steps < 60 / STEP && !arrived; steps++) arrived = stepWalk(b, route, field, colliders).arrived;
      expect(arrived, tier).toBe(true);
      expect(Math.hypot(b.x, b.z), tier).toBeLessThan(TREE_KEEP_OUT + 0.6);
      expect(steps * STEP, tier).toBeLessThan(length / MOTION.maxSpeed + 2);
      return [far.id, Math.round(Math.hypot(far.front.x, far.front.z) * 10) / 10, Math.round(length * 10) / 10, Math.round(steps * STEP * 10) / 10];
    });
    // [plot, straight distance to the tree's axis, planned walk (it ends at the boughs), seconds]
    expect(measured).toEqual([
      ["premium-01", 39.5, 35.5, 4.4],
      ["standard-05", 56.5, 52.8, 6.3],
      ["economy-09", 71.4, 68.5, 8.2],
    ]);
    // The avatar is spawned beside the tree: the same walk the other way starts at the spawn.
    const far = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-09")!;
    const route = createRoute();
    planRoute(field, route, SPAWN.x, SPAWN.z, far.front.x, far.front.z);
    expect([route.x, route.z, route.direct]).toEqual([far.front.x, far.front.z, false]);
  });

  it("keeps every dressing part on its own row, off the streets", () => {
    const rects = parcels(VILLAGE).filter((p) => /^(premium|standard|economy)-/.test(p.id));
    for (const part of RESIDENTIAL_DRESSING) {
      const home = Math.min(...rects.map((r) => distanceTo(r.rect, part.x, part.z)));
      expect(home, `${part.kind} at (${part.x.toFixed(1)}, ${part.z.toFixed(1)})`).toBeLessThan(0.3);
    }
    // Every tier is dressed differently: no kind of part is shared by two tiers.
    const kinds = PLOT_TIERS.map((t) => new Set(RESIDENTIAL_DRESSING.filter((part) => rects.find((r) => distanceTo(r.rect, part.x, part.z) < 0.3)?.id.startsWith(t)).map((part) => part.kind)));
    for (const k of kinds) expect(k.size).toBeGreaterThan(0);
    expect(new Set(kinds.flatMap((k) => [...k])).size).toBe(kinds.reduce((n, k) => n + k.size, 0));
  });
});

describe("village plan variants (the layout's own geometry; scenery, colliders and navigation are not part of it)", () => {
  const variant = (change: (p: VillagePlan) => void): VillagePlan => {
    const plan = JSON.parse(JSON.stringify(VILLAGE_PLAN)) as VillagePlan;
    change(plan);
    return plan;
  };
  // The knobs that are safe to turn (see the note above `VILLAGE_PLAN`): counts and sizes of the tiers, the
  // street width, the back yard and the edge.
  const plans: Array<[string, VillagePlan]> = [
    ["more plots per row", variant((p) => ((p.tiers.premium.perHalf = 2), (p.tiers.standard.perHalf = 3), (p.tiers.economy.perHalf = 6)))],
    ["fewer plots per row", variant((p) => ((p.tiers.standard.perHalf = 1), (p.tiers.economy.perHalf = 2)))],
    ["no economy tier", variant((p) => (p.tiers.economy.perHalf = 0))],
    ["no standard tier", variant((p) => (p.tiers.standard.perHalf = 0))],
    ["no residential tier at all", variant((p) => PLOT_TIERS.forEach((t) => (p.tiers[t].perHalf = 0)))],
    ["wider streets, back yard and edge", variant((p) => ((p.streetWidth = 5), (p.backYard = 2), (p.edge = 4)))],
    ["larger plots", variant((p) => ((p.tiers.premium.width = 14), (p.tiers.standard.depth = 9), (p.tiers.economy.width = 6.5)))],
  ];
  // The knobs that need the scenery of the square reviewed. The geometry of the layout still holds for them, and
  // that is all this says: nothing here looks at the market, the sleigh, the NPCs or the navigation grid.
  plans.push(
    ["geometry only: two lots on each half of the frontage", variant((p) => (p.frontage.perHalf = 2))],
    ["geometry only: a shop on every side", variant((p) => (p.shopEvery = 1))],
    ["geometry only: no shops", variant((p) => (p.shopEvery = 0))],
    ["geometry only: wider avenues and lanes", variant((p) => ((p.avenueWidth = 6), (p.laneWidth = 4)))],
    ["geometry only: a square pushed out", variant((p) => (p.squareApothem = 34))]
  );
  // And a sweep: every combination of a few counts.
  for (const premium of [1, 2])
    for (const economy of [1, 3, 5])
      for (const frontage of [1, 3])
        plans.push([`sweep: ${premium} premium, ${economy} economy plots and ${frontage} lots per half`, variant((p) => ((p.tiers.premium.perHalf = premium), (p.tiers.economy.perHalf = economy), (p.frontage.perHalf = frontage)))]);

  it.each(plans)("%s", (_, plan) => {
    const v = layoutVillage(plan);
    // A plan may make rows longer than the plan in force: how far a plot may be from its avenue is checked apart.
    expect(invariants(v, false, Infinity).slice(0, 12)).toEqual([]);
    // Deterministic: the same plan gives the same village.
    expect(layoutVillage(plan)).toEqual(v);
  });

  it("reserves no ring and no street for a tier without plots", () => {
    const without = layoutVillage(variant((p) => (p.tiers.economy.perHalf = 0)));
    expect(without.rings.map((r) => r.zone)).toEqual(["frontage", "premium", "standard"]);
    expect(without.plots.some((p) => p.tier === "economy")).toBe(false);
    expect(without.graph.nodes.some((n) => n.id.endsWith("-street-3"))).toBe(false);
    // The world ends behind the standard ring: smaller than with one economy plot per half row, which needs its street.
    const standard = without.rings[2];
    expect(without.worldRadius).toBe(Math.ceil((Math.hypot(standard.back, standard.reach) + VILLAGE_PLAN.edge) * 2 - 1e-9) / 2);
    expect(without.worldRadius).toBeLessThan(layoutVillage(variant((p) => (p.tiers.economy.perHalf = 1))).worldRadius);
    // A tier in the middle: the next one moves in to take its place.
    const noStandard = layoutVillage(variant((p) => (p.tiers.standard.perHalf = 0)));
    expect(noStandard.rings.map((r) => r.zone)).toEqual(["frontage", "premium", "economy"]);
    expect(noStandard.rings[2].front).toBeLessThan(VILLAGE.rings[3].front);
  });

  it("refuses a plan it cannot draw, naming the field, instead of laying out NaN", () => {
    const refused: Array<[string, (p: VillagePlan) => void, RegExp]> = [
      ["no sides", (p) => (p.sides = 0), /sides must be 8, got 0/],
      ["a negative number of sides", (p) => (p.sides = -3), /sides must be 8, got -3/],
      ["half a side", (p) => (p.sides = 2.5), /sides must be a whole number, got 2\.5/],
      ["six sides (an avenue would run over the scenery of the square)", (p) => (p.sides = 6), /sides must be 8, got 6: the scenery of the square/],
      ["ten sides", (p) => (p.sides = 10), /sides must be 8, got 10/],
      ["a negative lane", (p) => (p.laneWidth = -4), /laneWidth must be a positive number, got -4/],
      ["a street of no width", (p) => (p.streetWidth = 0), /streetWidth must be a positive number, got 0/],
      ["an avenue of no width", (p) => (p.avenueWidth = 0), /avenueWidth must be a positive number, got 0/],
      ["a size that is not a number", (p) => (p.squareApothem = Number.NaN), /squareApothem must be beyond the round street/],
      ["a square inside the round street", (p) => (p.squareApothem = 15), /squareApothem must be beyond the round street \(17\), got 15/],
      ["a negative back yard", (p) => (p.backYard = -1), /backYard must be zero or more, got -1/],
      ["half a plot", (p) => (p.tiers.economy.perHalf = 1.5), /tiers\.economy\.perHalf must be a whole number, zero or more, got 1\.5/],
      ["a negative count", (p) => (p.tiers.premium.perHalf = -1), /tiers\.premium\.perHalf must be a whole number, zero or more, got -1/],
      ["a plot of no width", (p) => (p.tiers.standard.width = 0), /tiers\.standard\.width must be a positive number, got 0/],
      ["a frontage narrower than the pad of a lot", (p) => (p.frontage.width = 6), /frontage\.width must be at least 7/],
      ["a frontage too shallow for a porch", (p) => (p.frontage.depth = 6), /frontage\.depth must be at least 8/],
      ["half a shop spacing", (p) => (p.shopEvery = 1.5), /shopEvery must be a whole number/],
      ["a level that is not one", (p) => (p.tiers.economy.requirement.level = 0), /tiers\.economy\.requirement\.level must be a whole number from 1, got 0/],
    ];
    for (const [name, change, message] of refused) {
      expect(() => assertPlan(variant(change)), name).toThrow(RangeError);
      expect(() => layoutVillage(variant(change)), name).toThrow(message);
    }
    expect(SCENERY_SIDES).toBe(VILLAGE_PLAN.sides);
    expect(() => assertPlan(VILLAGE_PLAN)).not.toThrow();
  });

  it("flags a plan whose rows put a plot too far from its avenue (rule 2 of SIGHTLINE)", () => {
    const long = layoutVillage(variant((p) => (p.tiers.economy.perHalf = 7)));
    const wrong = invariants(long, false);
    expect(wrong.length).toBeGreaterThan(0);
    expect(wrong.every((w) => /^economy-\d+: the avenue is more than 30 u away$/.test(w))).toBe(true);
  });

  it("flags a tall thing on an avenue (rule 1 of SIGHTLINE): the pines of the plan in force count", () => {
    // The corridors are open with the pines where they are, and a chalet on an avenue's line is caught.
    expect(invariants(VILLAGE, true)).toEqual([]);
    const blocked = { ...VILLAGE, lots: [...VILLAGE.lots, { id: "plaza-99", slot: 99, x: 46.19, z: 19.13, facing: 0 }] };
    expect(invariants(blocked, true).some((w) => /^avenue-01: view blocked/.test(w))).toBe(true);
  });

  it("grows or shrinks the world with the plan, and never moves the tree", () => {
    const small = layoutVillage(variant((p) => (p.tiers.economy.perHalf = 1)));
    const large = layoutVillage(variant((p) => (p.tiers.economy.perHalf = 8)));
    expect(small.worldRadius).toBeLessThanOrEqual(VILLAGE.worldRadius);
    expect(large.worldRadius).toBeGreaterThan(VILLAGE.worldRadius);
    expect(large.plots.filter((p) => p.tier === "economy")).toHaveLength(8 * 16);
  });
});
