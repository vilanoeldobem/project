/**
 * The village plan (IMPL-0024 and IMPL-0031, PROPOSTA). `layoutVillage` derives the layout from `VILLAGE_PLAN`;
 * these are the rules it must keep. The plan in force is checked whole: geometry, zoning, ids pinned to their
 * places, the seeds of migrations 0012 and 0015, colliders and navigation. Other plans are checked for the
 * layout's own geometry only: the scenery of the square, the colliders and the navigation grid exist for the
 * plan in force and no other.
 */
import { describe, expect, it } from "vitest";

import seed from "../../../../migrations/0012_village_expansion.sql?raw";
import growth from "../../../../migrations/0015_village_growth.sql?raw";

import { AVATAR_RADIUS, clearance, type Collider, distanceTo, footprint } from "./collision";
import { createBody, MOTION, STEP } from "./motion";
import { attainableLevel } from "./progress";
import { createNavField, createRoute, isOpen, lineClear, planRoute, stepWalk } from "./navigation";
import {
  assertPlan,
  BILLBOARDS,
  BOARD_FORMATS,
  CIVIC,
  CIVIC_KINDS,
  GIFTS,
  HOUSE_ENVELOPE,
  houseEnvelope,
  INTERACT_DISTANCE,
  layoutVillage,
  LOT_DRESSING,
  LOT_ROWS,
  lotById,
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
  siteColliders,
  siteCopy,
  SITE_PROPS,
  SITES,
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
  // A civic building, a park or a square: the whole half row.
  ...v.sites.map((site) => ({ id: site.id, rect: footprint({ x: site.x, z: site.z, rot: site.facing }, -site.width / 2, site.width / 2, -site.depth / 2, site.depth / 2) })),
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

/** What blocks a view (see `SIGHTLINE`): chalets of plots and lots, shops, civic buildings, and (for the plan in force) the pines. */
function tall(v: VillageLayout, pines: boolean): Collider[] {
  return [
    ...v.plots.flatMap((p) => houseEnvelope(p.tier, v.plan).map(([x0, x1, z0, z1]) => footprint({ x: p.house.x, z: p.house.z, rot: p.facing }, x0, x1, z0, z1))),
    ...v.lots.flatMap((l) => HOUSE_ENVELOPE.map(([x0, x1, z0, z1]) => footprint({ x: l.x, z: l.z, rot: l.facing }, x0, x1, z0, z1))),
    ...v.shops.flatMap((s) => SHOP_SOLID.map(([x0, x1, z0, z1]) => footprint({ x: s.x, z: s.z, rot: s.facing }, x0, x1, z0, z1))),
    ...v.sites.flatMap(siteColliders),
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
  const ids = [...v.lots, ...v.shops, ...v.billboards, ...v.plots, ...v.sites, ...v.graph.nodes].map((x) => x.id);
  if (new Set(ids).size !== ids.length) wrong.push("duplicate ids");

  // Counts follow the plan: the frontage, then what the zoning of each ring says, half row by half row.
  const halves = 2 * plan.sides;
  const shops = plan.shopEvery > 0 ? Math.ceil(plan.sides / plan.shopEvery) : 0;
  const letters = (letter: string, rings = plan.rings) => rings.reduce((n, r) => n + [...r.zoning].filter((l) => l === letter).length * (letter === "N" || letter === "R" ? r.perHalf : 1), 0);
  if (v.shops.length !== shops || v.billboards.filter((b) => b.format === "rooftop").length !== shops) wrong.push(`shops ${v.shops.length}, expected ${shops}`);
  if (v.lots.length !== halves * plan.frontage.perHalf - shops + letters("N")) wrong.push(`lots ${v.lots.length}`);
  for (const tier of PLOT_TIERS) {
    const n = v.plots.filter((p) => p.tier === tier).length;
    if (n !== letters("R", plan.rings.filter((r) => r.tier === tier))) wrong.push(`${tier} plots ${n}`);
  }
  for (const [use, letter] of [["civic", "C"], ["park", "P"], ["square", "S"]]) if (v.sites.filter((x) => x.use === use).length !== letters(letter)) wrong.push(`${use} sites ${v.sites.filter((x) => x.use === use).length}`);
  if (v.sites.filter((x) => x.kind).map((x) => x.kind).join() !== plan.civic.join()) wrong.push("civic buildings are not in the order of the plan");
  // Slots: 1..n per street for lots (`UNIQUE(street, slot)` in D1) and per tier for plots; numbers 1..n over every lot.
  const streetsOf = [...new Set(v.lots.map((l) => l.street))];
  if (streetsOf.some((street) => v.lots.filter((l) => l.street === street).some((l, i) => l.slot !== i + 1)) || PLOT_TIERS.some((t) => v.plots.filter((p) => p.tier === t).some((p, i) => p.slot !== i + 1))) wrong.push("slots are not 1..n");
  if (v.lots.some((l, i) => l.number !== i + 1)) wrong.push("lot numbers are not 1..n");
  if (v.lots.some((l) => !l.id.startsWith(`${l.street}-`))) wrong.push("a lot id does not start with its street");

  // Rings follow the distance from the tree: the frontage, then each ring of the plan, without overlap.
  const reach = (list: Array<{ x: number; z: number }>) => [Math.min(...list.map((p) => Math.hypot(p.x, p.z))), Math.max(...list.map((p) => Math.hypot(p.x, p.z)))];
  const onRing = (id: string) => [...v.lots.filter((l) => l.street === id), ...v.plots.filter((p) => p.ring === id), ...v.sites.filter((x) => x.ring === id)];
  const bands = [reach([...v.lots.filter((l) => l.street === "plaza"), ...v.shops]), ...plan.rings.map((r) => reach(onRing(r.id)))];
  for (let i = 1; i < bands.length; i++) if (bands[i][0] <= bands[i - 1][1]) wrong.push(`ring ${i} starts at ${bands[i][0].toFixed(1)}, inside ring ${i - 1} (${bands[i - 1][1].toFixed(1)})`);
  for (let i = 1; i < v.rings.length; i++) if (v.rings[i].front < v.rings[i - 1].back + plan.backYard + plan.streetWidth - 1e-9) wrong.push(`ring ${i} leaves no room for its street`);
  // One ring (and one street) per ring of the plan, after the frontage, in the plan's order.
  const zones = ["frontage", ...plan.rings.map((r) => r.id)];
  if (v.rings.map((r) => r.id).join() !== zones.join()) wrong.push(`rings ${v.rings.map((r) => r.id).join()}, expected ${zones.join()}`);
  // Ids of a kind share one width, so they sort and match `<kind>-<digits>` whatever the count.
  for (const kind of ["plaza", "shop", "billboard", "outdoor", "lawn", "screen", "civic", "park", "square", ...PLOT_TIERS, ...plan.rings.map((r) => r.id)]) {
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

describe("village plan in force (IMPL-0024 and IMPL-0031, PROPOSTA)", () => {
  it("keeps every rule of the layout", () => {
    expect(invariants(VILLAGE, true)).toEqual([]);
  });

  it("derives these numbers from VILLAGE_PLAN", () => {
    expect(WORLD_RADIUS).toBe(99);
    expect(VILLAGE.rings.map((r) => [r.id, r.tier, r.front, r.back])).toEqual([
      ["frontage", null, 26, 34],
      ["ring1", "premium", 39.5, 49.5],
      ["ring2", "standard", 55, 63],
      ["ring3", "standard", 68.5, 76.5],
      ["ring4", "economy", 82, 91],
    ]);
    expect([LOTS.length, SHOPS.length, RESIDENTIAL_PLOTS.length, SITES.length]).toEqual([97, 4, 23, 16]);
    expect(["plaza", "ring1", "ring2", "ring3", "ring4"].map((street) => LOTS.filter((l) => l.street === street).length)).toEqual([12, 7, 18, 30, 30]);
    expect(PLOT_TIERS.map((t) => RESIDENTIAL_PLOTS.filter((p) => p.tier === t).length)).toEqual([5, 12, 6]);
    expect(["civic", "park", "square"].map((use) => SITES.filter((x) => x.use === use).length)).toEqual([11, 3, 2]);
    expect(Object.keys(BOARD_FORMATS).map((format) => BILLBOARDS.filter((b) => b.format === format).length)).toEqual([4, 7, 21, 5]);
    // The lots of the square keep their ids; the rings add theirs after them.
    expect(LOTS.slice(0, 12).map((l) => l.id)).toEqual(["plaza-01", "plaza-02", "plaza-03", "plaza-04", "plaza-05", "plaza-06", "plaza-07", "plaza-08", "plaza-09", "plaza-10", "plaza-11", "plaza-12"]);
    expect([LOTS[12].id, LOTS[19].id, LOTS[37].id, LOTS[67].id, LOTS[96].id]).toEqual(["ring1-01", "ring2-01", "ring3-01", "ring4-01", "ring4-30"]);
    expect(LOTS.map((l) => l.number)).toEqual(LOTS.map((_, i) => i + 1));
    expect(SHOPS.map((s) => s.id)).toEqual(["shop-01", "shop-02", "shop-03", "shop-04"]);
    expect(BILLBOARDS.slice(0, 4).map((b) => [b.id, b.shopId])).toEqual([["billboard-01", "shop-01"], ["billboard-02", "shop-02"], ["billboard-03", "shop-03"], ["billboard-04", "shop-04"]]);
    expect([RESIDENTIAL_PLOTS[0].id, RESIDENTIAL_PLOTS[5].id, RESIDENTIAL_PLOTS[17].id, RESIDENTIAL_PLOTS[22].id]).toEqual(["premium-01", "standard-01", "economy-01", "economy-06"]);
    const length = (kind: string) => Math.round(PATH_GRAPH.edges.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.length, 0));
    expect([length("plaza"), length("avenue"), length("street"), length("lane")]).toMatchInlineSnapshot(`
      [
        92,
        664,
        1571,
        548,
      ]
    `);
  });

  it("zones about four parcels in five for NGOs, and scatters the rest (IMPL-0031)", () => {
    // By parcels: NGO lots against houses. The owner asked for "about 80/20".
    const share = LOTS.length / (LOTS.length + RESIDENTIAL_PLOTS.length);
    expect(share).toBeGreaterThan(0.77);
    expect(share).toBeLessThan(0.83);
    // By ground: the half rows of lots against the half rows of houses, each with its area, plus the square's lots.
    const area = (use: string) => VILLAGE.rings.reduce((sum, r) => sum + r.uses.filter((u) => u === use).length * r.perHalf * r.width * r.depth, 0);
    const ngo = area("ngo") + 12 * VILLAGE_PLAN.frontage.width * VILLAGE_PLAN.frontage.depth, homes = area("residential");
    expect(ngo / (ngo + homes)).toBeGreaterThan(0.77);
    expect(ngo / (ngo + homes)).toBeLessThan(0.83);
    // Every civic building of the list stands once, with a name and a line about it, and none stands beside another.
    expect(SITES.filter((x) => x.kind).map((x) => x.kind)).toEqual([...VILLAGE_PLAN.civic]);
    expect(new Set(VILLAGE_PLAN.civic).size).toBe(VILLAGE_PLAN.civic.length);
    expect([...VILLAGE_PLAN.civic].sort()).toEqual([...CIVIC_KINDS].sort());
    for (const ring of VILLAGE.rings) for (let i = 0; i < ring.uses.length; i++) if (ring.uses[i] === "civic") expect(ring.uses[(i + 1) % ring.uses.length], `${ring.id} half row ${i}`).not.toBe("civic");
    // Houses, parks and squares stand on every quarter of the village, on more than one ring.
    for (const quarter of [0, 1, 2, 3]) {
      expect(RESIDENTIAL_PLOTS.some((p) => Math.floor(placeOf(p)[0] / 2) === quarter), `houses on quarter ${quarter}`).toBe(true);
      expect(SITES.some((x) => Math.floor(x.side / 2) === quarter), `a site on quarter ${quarter}`).toBe(true);
    }
    expect(new Set(SITES.filter((x) => x.use !== "civic").map((x) => x.ring)).size).toBeGreaterThan(2);
    // No vehicles in the village: the list has a sleigh station and no petrol station.
    expect(CIVIC_KINDS).toContain("sleigh-station");
    expect(JSON.stringify(CIVIC)).not.toMatch(/gasolina|combust|carro|estacionamento/i);
  });

  it("names every civic building, park and square in the village's own words: nothing sold, nothing announced", () => {
    const names = SITES.map((x) => siteCopy(x).name);
    expect(new Set(names).size).toBe(names.length);
    for (const site of SITES) {
      const { name, about } = siteCopy(site);
      expect(name.length, site.id).toBeGreaterThan(4);
      // What it is today: no opening, no price, no offer, no brand mark, no address.
      expect(`${name} ${about}`, site.id).not.toMatch(/em breve|ainda não|por enquanto|vai abrir|R\$|compr|vend|preço|grátis|promo|http|www\.|@|®|™/i);
    }
  });

  /** Said by the tests below when they fail. */
  const POSITIONAL =
    "ids are positional and stored in D1 (lots.id, ngos.requested_lot_id, progress_events, quest objectives, ngo_withdrawals.lot_ids, audit details, residential_plots.id): " +
    "a plan that moves or renumbers a lot or a plot needs, once migrations 0012 and 0015 are applied, a new migration that moves or renames those rows (IMPL-0024, IMPL-0031, OQ-19). Do not update this table without one.";
  /** Side of the village a point is on, and the half of that side (+1 = counter-clockwise of the lane). */
  function placeOf(p: { x: number; z: number }) {
    const side = ((Math.round(Math.atan2(p.z, p.x) / ((2 * Math.PI) / VILLAGE_PLAN.sides)) % VILLAGE_PLAN.sides) + VILLAGE_PLAN.sides) % VILLAGE_PLAN.sides;
    const f = sideFrame(VILLAGE_PLAN, side);
    return [side, Math.sign(p.x * f.tx + p.z * f.tz)];
  }

  it("pins every lot of the square to its side, its half and its coordinates", () => {
    // Unchanged by the rings (IMPL-0031): the frontage and the square did not move.
    expect(LOTS.filter((l) => l.street === "plaza").map((l) => [l.id, ...placeOf(l), l.x, l.z]), POSITIONAL).toEqual([
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

  it("pins the first and the last lot of every ring, and the first and the last plot of every tier", () => {
    const ends = <T extends { id: string; x: number; z: number }>(list: T[]) => [list[0], list[list.length - 1]].map((p) => [p.id, ...placeOf(p), p.x, p.z]);
    expect(VILLAGE_PLAN.rings.map((r) => ends(LOTS.filter((l) => l.street === r.id))), POSITIONAL).toMatchInlineSnapshot(`
      [
        [
          [
            "ring1-01",
            0,
            1,
            44,
            7.5,
          ],
          [
            "ring1-07",
            7,
            1,
            36.42,
            -25.81,
          ],
        ],
        [
          [
            "ring2-01",
            0,
            -1,
            59.5,
            -15.75,
          ],
          [
            "ring2-18",
            7,
            1,
            53.21,
            -30.94,
          ],
        ],
        [
          [
            "ring3-01",
            0,
            -1,
            73,
            -21.5,
          ],
          [
            "ring3-30",
            7,
            -1,
            47.73,
            -55.51,
          ],
        ],
        [
          [
            "ring4-01",
            0,
            -1,
            86.5,
            -26.5,
          ],
          [
            "ring4-30",
            7,
            1,
            79.9,
            -42.43,
          ],
        ],
      ]
    `);
    expect(PLOT_TIERS.map((tier) => ends(RESIDENTIAL_PLOTS.filter((p) => p.tier === tier))), POSITIONAL).toMatchInlineSnapshot(`
      [
        [
          [
            "premium-01",
            0,
            -1,
            44.5,
            -7.5,
          ],
          [
            "premium-05",
            7,
            -1,
            26.16,
            -36.77,
          ],
        ],
        [
          [
            "standard-01",
            0,
            1,
            59,
            6.25,
          ],
          [
            "standard-12",
            6,
            1,
            21.5,
            -72.5,
          ],
        ],
        [
          [
            "economy-01",
            2,
            -1,
            26.5,
            86.5,
          ],
          [
            "economy-06",
            6,
            1,
            26.5,
            -86.5,
          ],
        ],
      ]
    `);
  });

  it("pins every civic building, park and square to its ring, its side and its half", () => {
    expect(SITES.map((x) => `${x.id} ${x.kind ?? x.use} ${x.ring} side ${x.side} ${x.half > 0 ? "+" : "-"}`)).toMatchInlineSnapshot(`
      [
        "civic-01 bank ring1 side 1 -",
        "civic-02 restaurant ring1 side 3 +",
        "square-01 square ring1 side 5 -",
        "civic-03 gym ring1 side 6 +",
        "civic-04 school ring2 side 1 +",
        "civic-05 cinema ring2 side 4 -",
        "park-01 park ring2 side 6 -",
        "civic-06 theatre ring2 side 7 -",
        "civic-07 supermarket ring3 side 1 -",
        "park-02 park ring3 side 3 +",
        "civic-08 hospital ring3 side 5 -",
        "civic-09 sleigh-station ring3 side 7 +",
        "square-02 square ring4 side 0 +",
        "civic-10 mall ring4 side 3 -",
        "park-03 park ring4 side 4 +",
        "civic-11 sports-hall ring4 side 6 -",
      ]
    `);
  });

  it("numbers ids with two digits today, and with as many as the largest count needs", () => {
    for (const id of [...LOTS, ...SHOPS, ...BILLBOARDS, ...RESIDENTIAL_PLOTS, ...SITES].map((x) => x.id)) expect(id).toMatch(/^[a-z]+\d?-\d\d$/);
    const plan = JSON.parse(JSON.stringify(VILLAGE_PLAN)) as VillagePlan;
    // A ring with more than 99 lots: every id of that ring grows a digit, and no other id changes.
    plan.rings[3] = { ...plan.rings[3], perHalf: 9, width: 7, zoning: "N".repeat(16) };
    plan.civic = plan.civic.slice(0, 9);
    const grown = layoutVillage(plan).lots;
    const ring4 = grown.filter((l) => l.street === "ring4").map((l) => l.id);
    expect([ring4.length, ring4[0], ring4[98], ring4[99], ring4[143]]).toEqual([144, "ring4-001", "ring4-099", "ring4-100", "ring4-144"]);
    // One width: the ids sort in slot order and keep the `<street>-<digits>` form.
    expect([...ring4].sort()).toEqual(ring4);
    // The other streets of that plan keep their ids, their places and their numbers.
    expect(grown.filter((l) => l.street !== "ring4")).toEqual(LOTS.filter((l) => l.street !== "ring4"));
  });

  it("adds a ring without moving or renaming anything that stood before it", () => {
    const plan = JSON.parse(JSON.stringify(VILLAGE_PLAN)) as VillagePlan;
    plan.rings.push({ id: "ring5", tier: "economy", perHalf: 4, width: 9, depth: 9, zoning: "NNNNNRNNNNPNNNRN" });
    const grown = layoutVillage(plan);
    expect(grown.lots.slice(0, LOTS.length)).toEqual(LOTS);
    expect(grown.shops).toEqual(SHOPS);
    expect(grown.sites.slice(0, SITES.length)).toEqual(SITES);
    // The houses of the tiers that the new ring does not use keep their ids; its own tier only gains plots at the end.
    expect(grown.plots.filter((p) => p.ring !== "ring5")).toEqual(RESIDENTIAL_PLOTS);
    expect(grown.lots.length).toBe(LOTS.length + 13 * 4);
    expect(grown.worldRadius).toBeGreaterThan(WORLD_RADIUS);
    expect(grown.rings.slice(0, VILLAGE.rings.length)).toEqual(VILLAGE.rings);
  });

  it("asks a requirement of each tier, never a price (PROPOSTA, OQ-17)", () => {
    for (const tier of PLOT_TIERS) {
      const t = VILLAGE_PLAN.tiers[tier];
      expect(t.requirement.kind).toBe("level");
      expect(Number.isInteger(t.requirement.level) && t.requirement.level >= 1).toBe(true);
      expect(Object.keys(t).sort()).toEqual(["house", "label", "requirement"]);
    }
    for (const ring of VILLAGE_PLAN.rings) expect(Object.keys(ring).sort()).toEqual(["depth", "id", "perHalf", "tier", "width", "zoning"]);
    // Nearer the tree asks more.
    const [premium, standard, economy] = PLOT_TIERS.map((t) => VILLAGE_PLAN.tiers[t].requirement.level);
    expect(premium).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(economy);
    // …and the tiers of the rings never get dearer away from the tree.
    const order = VILLAGE_PLAN.rings.map((r) => PLOT_TIERS.indexOf(r.tier));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Every level asked can be reached by playing, with nothing bought: all three with the quest catalog on,
    // only the outer tier with the four missions that are open in production today (the plot panel says so).
    expect([attainableLevel(false), attainableLevel(true)]).toEqual([2, 6]);
    expect(premium).toBeLessThanOrEqual(attainableLevel(true));
    expect([premium, standard, economy].map((level) => level <= attainableLevel(false))).toEqual([false, false, true]);
    // The names the UI shows are places, not classes.
    expect(PLOT_TIERS.map((t) => VILLAGE_PLAN.tiers[t].label)).toEqual(["Bairro do Centro", "Bairro do Meio", "Bairro da Floresta"]);
  });

  it("matches the seed of migration 0012 for the lots of the square", () => {
    for (const lot of LOTS.filter((l) => l.street === "plaza"))
      expect(seed, lot.id).toContain(lot.slot <= 8 ? `UPDATE lots SET x = ${lot.x}, z = ${lot.z} WHERE id = '${lot.id}';` : `('${lot.id}', 'plaza', ${lot.slot}, ${lot.x}, ${lot.z})`);
    expect(seed.match(/UPDATE lots SET/g)).toHaveLength(8);
    expect(seed.match(/\('plaza-\d\d', 'plaza',/g)).toHaveLength(4);
    // No price anywhere: the table has no amount, currency or price column.
    expect(/price|amount|currency|coin|R\$/i.test(seed.replace(/--.*$/gm, ""))).toBe(false);
  });

  it("matches the seed of migration 0015: every lot of the rings, and the residential plots seeded again", () => {
    /** The statements the plan in force needs: what a failure of this test asks to be written into the migration. */
    const ring = LOTS.filter((l) => l.street !== "plaza");
    const wanted = [
      "INSERT INTO lots (id, street, slot, x, z) VALUES",
      ring.map((l) => `  ('${l.id}', '${l.street}', ${l.slot}, ${l.x}, ${l.z})`).join(",\n") + ";",
      "",
      "DELETE FROM residential_plots;",
      "",
      "INSERT INTO residential_plots (id, tier, slot, x, z, facing) VALUES",
      RESIDENTIAL_PLOTS.map((p) => `  ('${p.id}', '${p.tier}', ${p.slot}, ${p.x}, ${p.z}, ${p.facing})`).join(",\n") + ";",
    ].join("\n");
    const statements = growth.split("\n").filter((line) => !line.startsWith("--")).join("\n").trim();
    expect(statements, POSITIONAL).toBe(wanted);
    // The lots of the square are not touched: they keep their rows, their state and their NGO.
    expect(statements).not.toMatch(/plaza|UPDATE|DROP|ALTER/);
    expect(/price|amount|currency|coin|R\$/i.test(statements)).toBe(false);
  });

  it("finds a lot by its id in the plan, and nothing for an id that is not one", () => {
    expect(lotById("plaza-03")?.number).toBe(3);
    expect(lotById("ring2-05")?.street).toBe("ring2");
    for (const id of ["plaza-13", "ring9-01", "plaza-3", "", "premium-01", "shop-01"]) expect(lotById(id), id).toBeUndefined();
  });
});

describe("village on foot (IMPL-0016 over the plan in force)", () => {
  const colliders = [...OBSTACLES, ...RESIDENTIAL_PLOTS.flatMap((p) => plotColliders(p)), ...LOTS.flatMap((l) => lotColliders(l, HOUSE_ENVELOPE))];
  const field = createNavField(colliders);
  const places = [
    ...RESIDENTIAL_PLOTS.map((p) => ({ id: p.id, ...p.front })),
    ...SHOPS.map((s) => ({ id: s.id, ...s.door })),
    ...BILLBOARDS.map((b) => ({ id: b.id, ...b.point })),
    ...SITES.map((x) => ({ id: x.id, ...x.front })),
    ...LOTS.filter((l) => l.street !== "plaza").map((l) => ({ id: l.id, ...lotFront(l) })),
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
  }, 60_000); // two navigation fields and a walk to every place

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
    expect([...new Set(belt.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))))].sort((a, b) => a - b)).toMatchInlineSnapshot(`
      [
        74,
        96,
      ]
    `);
  });

  it("keeps the shopkeepers' spots, the shop doors and the points of every board and site free", () => {
    for (const s of SHOPS) {
      expect(isOpen(field, s.door.x, s.door.z), `${s.id} door`).toBe(true);
      expect(isOpen(field, s.keeper.x, s.keeper.z), `${s.id} keeper`).toBe(true);
      expect(Math.hypot(s.keeper.x - s.door.x, s.keeper.z - s.door.z), `${s.id} keeper beside the door`).toBeLessThan(3);
    }
    for (const b of BILLBOARDS) expect(isOpen(field, b.point.x, b.point.z), b.id).toBe(true);
    for (const x of SITES) expect(isOpen(field, x.front.x, x.front.z), x.id).toBe(true);
  });

  it("stands every board where it can be read: its point within sight of it, and no two points in one place", () => {
    for (const b of BILLBOARDS) expect(Math.hypot(b.point.x - b.x, b.point.z - b.z), b.id).toBeLessThan(b.format === "screen" ? 14 : 11);
    const points = [...BILLBOARDS.map((b) => ({ id: b.id, ...b.point })), ...SITES.map((x) => ({ id: x.id, ...x.front })), ...SHOPS.map((x) => ({ id: x.id, ...x.door }))];
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) expect(Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z), `${points[i].id} and ${points[j].id}`).toBeGreaterThan(1.5);
    // A board that stands on the ground is inside the world, off every street, avenue and lane.
    const node = new Map(PATH_GRAPH.nodes.map((n) => [n.id, n]));
    for (const b of BILLBOARDS.filter((x) => x.grounded)) {
      expect(Math.hypot(b.x, b.z), b.id).toBeLessThan(WORLD_RADIUS - 1);
      for (const e of PATH_GRAPH.edges) {
        if (e.kind === "plaza") continue;
        const p = node.get(e.a)!, q = node.get(e.b)!;
        const dx = q.x - p.x, dz = q.z - p.z;
        const t = Math.max(0, Math.min(1, ((b.x - p.x) * dx + (b.z - p.z) * dz) / (dx * dx + dz * dz)));
        expect(Math.hypot(b.x - p.x - t * dx, b.z - p.z - t * dz) - e.width / 2, `${b.id} beside ${e.a} → ${e.b}`).toBeGreaterThan(0.4);
      }
    }
  });

  it("reaches every place from another one, across the village", () => {
    const route = createRoute();
    places.forEach((from, i) => {
      // A fixed permutation: each place plans a walk to one far from it in the list (other ring, other side).
      const to = places[(i * 37 + 53) % places.length];
      planRoute(field, route, from.x, from.z, to.x, to.z);
      expect([route.x, route.z, route.direct], `${from.id} → ${to.id}`).toEqual([to.x, to.z, false]);
    });
    // And walks a few of them for real, the longest ones included.
    const n = places.length;
    const walks = [[0, n - 1], [Math.floor(n / 3), Math.floor((2 * n) / 3)], [n - 2, 5], [Math.floor(n / 2), 1]];
    for (const [i, j] of walks) {
      const b = createBody(places[i].x, places[i].z);
      planRoute(field, route, b.x, b.z, places[j].x, places[j].z);
      let arrived = false;
      for (let k = 0; k < 90 / STEP && !arrived; k++) arrived = stepWalk(b, route, field, colliders).arrived;
      expect(arrived, `${places[i].id} → ${places[j].id}`).toBe(true);
      expect(route.replans, `${places[i].id} → ${places[j].id}`).toBe(0);
    }
  }, 30_000);

  it("walks from the farthest lot of each ring to the tree in the documented time", () => {
    // The numbers of the ADR (IMPL-0031): the farthest lot front of each ring, a planned walk to the tree at
    // 8.5 u/s on the fixed 60 Hz step, every lot with a chalet. Length = planned route; time = steps walked.
    const measured = VILLAGE_PLAN.rings.map((ring) => {
      const far = LOTS.filter((l) => l.street === ring.id).map((l) => ({ id: l.id, ...lotFront(l) })).reduce((a, b) => (Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) + 1e-9 ? b : a));
      const b = createBody(far.x, far.z), route = createRoute();
      planRoute(field, route, b.x, b.z, 0, 0);
      const length = Math.hypot(route.xs[0] - b.x, route.zs[0] - b.z) + route.rest[0];
      let steps = 0, arrived = false;
      for (; steps < 60 / STEP && !arrived; steps++) arrived = stepWalk(b, route, field, colliders).arrived;
      expect(arrived, ring.id).toBe(true);
      expect(Math.hypot(b.x, b.z), ring.id).toBeLessThan(TREE_KEEP_OUT + 0.6);
      expect(steps * STEP, ring.id).toBeLessThan(length / MOTION.maxSpeed + 2);
      return [far.id, Math.round(Math.hypot(far.x, far.z) * 10) / 10, Math.round(length * 10) / 10, Math.round(steps * STEP * 10) / 10];
    });
    // [lot, straight distance to the tree's axis, planned walk (it ends at the boughs), seconds]
    expect(measured).toMatchInlineSnapshot(`
      [
        [
          "ring1-02",
          39.4,
          37.3,
          4.4,
        ],
        [
          "ring2-01",
          56.4,
          51.6,
          6.3,
        ],
        [
          "ring3-01",
          71,
          66.1,
          8,
        ],
        [
          "ring4-01",
          85.4,
          80.7,
          9.7,
        ],
      ]
    `);
    // The avatar is spawned beside the tree: the same walk the other way starts at the spawn.
    const far = lotFront(lotById(measured[measured.length - 1][0] as string)!);
    const route = createRoute();
    planRoute(field, route, SPAWN.x, SPAWN.z, far.x, far.z);
    expect([route.x, route.z, route.direct]).toEqual([far.x, far.z, false]);
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

  it("puts a hedge between neighbouring lots of a ring where their gardens are narrow, on the boundary and off the pads", () => {
    const narrow = LOT_ROWS.filter((row) => row.width - 7 < 4);
    expect(LOT_DRESSING).toHaveLength(narrow.reduce((n, row) => n + row.lots.length - 1, 0));
    const pads = LOTS.map((l) => footprint({ x: l.x, z: l.z, rot: l.facing }, -3.5, 3.5, -3.5, 3.5));
    for (const part of LOT_DRESSING) {
      expect(part.kind).toBe("hedge");
      // The whole hedge is clear of every pad (it may touch one: 0.02 forgives the rounding).
      const c = footprint(part, part.solid[0], part.solid[1], part.solid[2], part.solid[3]);
      for (const [x, z] of corners(c)) expect(Math.min(...pads.map((pad) => distanceTo(pad, x, z))), `hedge at (${part.x.toFixed(1)}, ${part.z.toFixed(1)})`).toBeGreaterThan(-0.02);
    }
  });

  it("keeps what stands in a park or on a square inside it", () => {
    const rect = new Map(parcels(VILLAGE).map((p) => [p.id, p.rect]));
    for (const prop of SITE_PROPS) expect(distanceTo(rect.get(prop.siteId)!, prop.x, prop.z), `${prop.kind} of ${prop.siteId}`).toBeLessThan(-1);
    for (const site of SITES) {
      const props = SITE_PROPS.filter((p) => p.siteId === site.id).map((p) => p.kind);
      if (site.use === "park") expect(props, site.id).toContain("bandstand");
      if (site.use === "square") expect(props, site.id).toContain("fountain");
      if (site.use === "civic") expect(props, site.id).toEqual([]);
      // Every civic building fits its half row, behind its setback.
      if (site.kind) for (const c of siteColliders(site)) for (const [x, z] of corners(c)) expect(distanceTo(rect.get(site.id)!, x, z), `${site.id} ${site.kind}`).toBeLessThan(0.02);
    }
    for (const kind of CIVIC_KINDS) expect(CIVIC[kind].solid.length, kind).toBeGreaterThan(0);
  });
});

describe("village plan variants (the layout's own geometry; scenery, colliders and navigation are not part of it)", () => {
  const variant = (change: (p: VillagePlan) => void): VillagePlan => {
    const plan = JSON.parse(JSON.stringify(VILLAGE_PLAN)) as VillagePlan;
    change(plan);
    return plan;
  };
  /** A ring of lots and houses only: a variant that changes sizes does not have to fit the civic buildings. */
  const plain = (p: VillagePlan, i: number, change: Partial<VillagePlan["rings"][number]>) => {
    const before = [...p.rings[i].zoning].filter((l) => l === "C").length;
    const first = p.rings.slice(0, i).reduce((n, r) => n + [...r.zoning].filter((l) => l === "C").length, 0);
    p.rings[i] = { ...p.rings[i], zoning: p.rings[i].zoning.replace(/[CPS]/g, "N"), ...change };
    p.civic.splice(first, before);
  };
  // The knobs that are safe to turn (see the note above `VILLAGE_PLAN`): counts, sizes and zoning of the rings,
  // the street width, the back yard and the edge.
  const plans: Array<[string, VillagePlan]> = [
    ["more parcels per row", variant((p) => (plain(p, 0, { perHalf: 2, width: 8 }), plain(p, 3, { perHalf: 4, width: 8 })))],
    ["fewer parcels per row", variant((p) => (plain(p, 1, { perHalf: 1 }), plain(p, 2, { perHalf: 2 })))],
    ["three rings", variant((p) => (plain(p, 3, {}), p.rings.pop()))],
    ["one ring", variant((p) => ((p.rings = [p.rings[0]]), (p.civic = p.civic.slice(0, 3))))],
    ["no ring at all: the square alone", variant((p) => ((p.rings = []), (p.civic = [])))],
    ["wider streets, back yard and edge", variant((p) => ((p.streetWidth = 5), (p.backYard = 2), (p.edge = 4)))],
    ["larger parcels", variant((p) => (plain(p, 0, { width: 14 }), plain(p, 1, { depth: 9 }), plain(p, 3, { width: 11 })))],
    ["every half row of a ring for houses", variant((p) => plain(p, 2, { zoning: "R".repeat(16) }))],
    ["every half row of a ring for NGOs", variant((p) => plain(p, 2, { zoning: "N".repeat(16) }))],
    ["a fifth ring", variant((p) => p.rings.push({ id: "ring5", tier: "economy", perHalf: 4, width: 9, depth: 9, zoning: "NNNNNRNNNNPNNNRN" }))],
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
  for (const first of [1, 2])
    for (const outer of [2, 3, 5])
      for (const frontage of [1, 3])
        plans.push([`sweep: ${first} parcels on the first ring, ${outer} on the last and ${frontage} lots per half of the frontage`, variant((p) => (plain(p, 0, { perHalf: first, width: first === 1 ? 12 : 8 }), plain(p, 3, { perHalf: outer, width: 8 }), (p.frontage.perHalf = frontage)))]);

  it.each(plans)("%s", (_, plan) => {
    const v = layoutVillage(plan);
    // A plan may make rows longer than the plan in force: how far a plot may be from its avenue is checked apart.
    expect(invariants(v, false, Infinity).slice(0, 12)).toEqual([]);
    // Deterministic: the same plan gives the same village.
    expect(layoutVillage(plan)).toEqual(v);
  });

  it("reserves a street for each ring of the plan and nothing for a ring that is not there", () => {
    const three = layoutVillage(variant((p) => (plain(p, 3, {}), p.rings.pop())));
    expect(three.rings.map((r) => r.id)).toEqual(["frontage", "ring1", "ring2", "ring3"]);
    expect(three.lots.some((l) => l.street === "ring4")).toBe(false);
    expect(three.graph.nodes.some((n) => n.id.endsWith("-street-4"))).toBe(false);
    // The world ends behind the third ring.
    const lastRing = three.rings[3];
    expect(three.worldRadius).toBe(Math.ceil((Math.hypot(lastRing.back, lastRing.reach) + VILLAGE_PLAN.edge) * 2 - 1e-9) / 2);
    expect(three.worldRadius).toBeLessThan(VILLAGE.worldRadius);
    // The square alone: the frontage, no street, no lane in the graph.
    const square = layoutVillage(variant((p) => ((p.rings = []), (p.civic = []))));
    expect(square.rings.map((r) => r.id)).toEqual(["frontage"]);
    expect([square.lots.length, square.plots.length, square.sites.length, square.billboards.length]).toEqual([12, 0, 0, 4]);
    expect(square.graph.nodes.some((n) => n.id.startsWith("lane-"))).toBe(false);
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
      ["half a parcel", (p) => (p.rings[3].perHalf = 1.5), /rings\[3\]\.perHalf must be a whole number from 1, got 1\.5/],
      ["a ring with no parcel", (p) => (p.rings[0].perHalf = 0), /rings\[0\]\.perHalf must be a whole number from 1, got 0/],
      ["a parcel of no width", (p) => (p.rings[1].width = 0), /rings\[1\]\.width must be a positive number, got 0/],
      ["a ring id that is not one", (p) => (p.rings[1].id = "plaza"), /rings\[1\]\.id must be "ring" and a number, got "plaza"/],
      ["the same ring twice", (p) => (p.rings[1].id = "ring1"), /rings\[1\]\.id "ring1" is used twice/],
      ["a tier that does not exist", (p) => (p.rings[0].tier = "luxury" as never), /rings\[0\]\.tier must be one of premium, standard, economy, got "luxury"/],
      ["a zoning with a letter missing", (p) => (p.rings[2].zoning = "NNNN"), /rings\[2\]\.zoning must have 16 letters \(two per side\), got "NNNN"/],
      ["a zoning with an unknown letter", (p) => (p.rings[2].zoning = "NNXNNRNPNNCNNRNC"), /rings\[2\]\.zoning has the letter "X"/],
      ["NGO lots narrower than a pad", (p) => (p.rings[2].width = 6), /rings\[2\]\.width must be at least 7 for NGO lots/],
      ["NGO lots too shallow for a porch", (p) => (p.rings[1].depth = 7), /rings\[1\]\.depth must be at least 8 for NGO lots/],
      ["a civic building with no name in the list", (p) => p.civic.pop(), /civic\[10\] must name a civic building for a C of ring4/],
      ["a civic building too many in the list", (p) => p.civic.push("bank"), /civic lists 12 building\(s\) and the zoning has 11 C/],
      ["a hall on a row too narrow for it", (p) => ([p.civic[0], p.civic[9]] = [p.civic[9], p.civic[0]]), /ring1 is too narrow for the mall/],
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

  it("flags a plan whose rows put a parcel too far from its avenue (rule 2 of SIGHTLINE)", () => {
    const long = layoutVillage(variant((p) => plain(p, 3, { perHalf: 6, width: 7, zoning: "N".repeat(16) })));
    const wrong = invariants(long, false);
    expect(wrong.length).toBeGreaterThan(0);
    expect(wrong.every((w) => /^ring4-\d+: the avenue is more than 30 u away$/.test(w))).toBe(true);
  });

  it("flags a tall thing on an avenue (rule 1 of SIGHTLINE): the pines of the plan in force count", () => {
    // The corridors are open with the pines where they are, and a chalet on an avenue's line is caught.
    expect(invariants(VILLAGE, true)).toEqual([]);
    const blocked = { ...VILLAGE, lots: [...VILLAGE.lots, { id: "plaza-99", street: "plaza", slot: 99, number: 99, x: 46.19, z: 19.13, facing: 0 }] };
    expect(invariants(blocked, true).some((w) => /^avenue-01: view blocked/.test(w))).toBe(true);
  });

  it("grows or shrinks the world with the plan, and never moves the tree", () => {
    const small = layoutVillage(variant((p) => (plain(p, 3, {}), p.rings.pop())));
    const large = layoutVillage(variant((p) => p.rings.push({ id: "ring5", tier: "economy", perHalf: 4, width: 9, depth: 9, zoning: "N".repeat(16) })));
    expect(small.worldRadius).toBeLessThan(VILLAGE.worldRadius);
    expect(large.worldRadius).toBeGreaterThan(VILLAGE.worldRadius);
    expect(large.lots.filter((l) => l.street === "ring5")).toHaveLength(4 * 16);
  });
});
