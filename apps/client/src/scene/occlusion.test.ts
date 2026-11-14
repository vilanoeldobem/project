/**
 * When the camera cannot see the avatar (IMPL-0024): the pure test behind the see-through tint and behind the
 * "look at the sky" camera, against the scene's own models.
 *
 * The cases under "street points" were measured in the real scene during the review of the first version
 * (issue #41): 1 440 points along the avenues, lanes and ring streets, with a ray from the camera at rest
 * (24 u up and 21 u south of a point 1 u over the avatar's feet) to the avatar's chest and head against every
 * mesh drawn, `plaza-03` published. The first version's rule (a building footprint up to 6 u south of the
 * avatar) agreed with those rays on 1 230 of them; the samples below are from each kind of disagreement and
 * from both kinds of agreement.
 */
import { describe, expect, it } from "vitest";

import { PATH_GRAPH, RESIDENTIAL_PLOTS, SHOPS, SPAWN } from "@vila/shared/game/world";

import { AVATAR_CHEST, AVATAR_HEAD, avatarHidden, blocksSegment, clearSkyOffset, columnsOf, type Offset, occluderAt, SEE_THROUGH_HOLD, seeThroughShown, segmentBlocked } from "./occlusion";
import { sceneBuildings, sceneOccluders } from "./sceneColliders";

const OCCLUDERS = sceneOccluders(new Set(["plaza-03"]));
/** The sky camera only minds buildings: the tree and the pines belong in its picture. */
const BUILDINGS = sceneBuildings(new Set(["plaza-03"]));
/** The camera at rest over an avatar at `(x, z)`, default zoom, landscape. */
const hidden = (x: number, z: number) => avatarHidden(OCCLUDERS, x, 25, z + 21, x, z);

describe("a segment against one model", () => {
  // A wall 3 wide, 1 deep and 4 high with a roof slab that overhangs it by one voxel on the +z side, 3 u up.
  const wall = columnsOf(
    [...[-1, 0, 1].flatMap((x) => [0, 1, 2, 3].map((y) => [x, y, 0] as const)), ...[-1, 0, 1].map((x) => [x, 3, 1] as const)],
    1
  );
  const at = occluderAt(wall, { x: 10, z: 20 });

  it("is blocked through the wall and clear over it, beside it and short of it", () => {
    expect(blocksSegment(at, 10, 2, 25, 10, 2, 15)).toBe(true);
    expect(blocksSegment(at, 10, 5, 25, 10, 5, 15)).toBe(false);
    expect(blocksSegment(at, 13, 2, 25, 13, 2, 15)).toBe(false);
    expect(blocksSegment(at, 10, 2, 25, 10, 2, 22)).toBe(false);
    // From above and south, down to a point right behind (north of) the wall: the wall is in the way.
    expect(blocksSegment(at, 10, 25, 41, 10, 1.1, 19)).toBe(true);
    // …and to a point 6 u behind it the line passes over the wall.
    expect(blocksSegment(at, 10, 25, 35, 10, 1.1, 14)).toBe(false);
  });

  it("lets a line pass under an overhang: a column is solid only between its lowest and its highest voxel", () => {
    // Under the slab (z = 21, 3 u up) at chest height, level: nothing there.
    expect(blocksSegment(at, 10, 1.1, 24, 10, 1.1, 20.6)).toBe(false);
    // Through the slab itself.
    expect(blocksSegment(at, 10, 3.5, 24, 10, 3.5, 20.6)).toBe(true);
  });

  it("turns with the model", () => {
    const turned = occluderAt(wall, { x: 10, z: 20, rot: Math.PI / 2 });
    // The wall now runs along z: a line along x through its middle is blocked, one 2 u to the side is still on it,
    // and the line along z that used to cross it passes beside its end.
    expect(blocksSegment(turned, 5, 2, 20, 15, 2, 20)).toBe(true);
    expect(blocksSegment(turned, 5, 2, 21, 15, 2, 21)).toBe(true);
    expect(blocksSegment(turned, 12, 2, 25, 12, 2, 15)).toBe(false);
  });

  it("has nothing to say about an empty model", () => {
    expect(blocksSegment(occluderAt(columnsOf([], 1), { x: 0, z: 0 }), -5, 1, 0, 5, 1, 0)).toBe(false);
  });
});

describe("street points measured in the scene (camera at rest, plaza-03 published)", () => {
  // [x, z, chest or head hidden]
  const cases: Record<string, Array<[number, number, 0 | 1]>> = {
    "in plain view, and the first rule agreed": [
      [14.56, 6.03, 0], [22.23, 53.68, 0], [0, 35.25, 0], [-20.12, -8.33, 0], [-26.71, -64.47, 0], [0, -42.92, 0],
      [37.5, -0.78, 0], [27.07, 25.97, 0], [-34.75, 18.28, 0], [-66.5, 13.01, 0], [-28.09, -65.96, 0], [52.48, -22.47, 0],
    ],
    "in plain view, where the first rule drew a red silhouette": [
      [53.68, 22.23, 0], [-38.01, 38.01, 0], [36.93, -36.93, 0], [52.97, 41.07, 0], [37.83, 56.22, 0], [-32.42, 61.63, 0],
      [-44.32, 49.73, 0], [-61.63, 32.42, 0], [-29.71, -45.24, 0], [-47.56, -46.48, 0], [28.68, -46.27, 0], [34.58, -59.47, 0],
    ],
    "hidden, and the first rule agreed": [
      [55.03, 22.79, 1], [28.16, 28.16, 1], [-29.26, 29.26, 1], [-33.75, 0, 1], [-45.43, -45.43, 1], [34.74, -34.74, 1],
      [16.83, 53, 1], [23.72, 66.5, 1], [-3.83, 66.5, 1], [-3.88, -37.5, 1], [32.7, 22.1, 1], [-27.22, 49.5, 1],
    ],
    "hidden, where the first rule drew nothing (corners, diagonal rows)": [
      [56.75, 0, 1], [51.8, 51.8, 1], [-26.25, 0, 1], [-42.25, -42.25, 1], [50.74, -50.73, 1], [48.34, 26.61, 1],
      [42.14, 32.82, 1], [27.64, 47.31, 1], [-26.61, 48.34, 1], [-32.82, 42.14, 1], [-36.96, 38, 1], [-45.24, 29.71, 1],
    ],
  };
  it.each(Object.keys(cases))("%s", (name) => {
    for (const [x, z, truth] of cases[name]) expect(hidden(x, z), `(${x}, ${z})`).toBe(truth === 1);
  });
});

describe("the avatar and the camera", () => {
  it("is in plain view at the spawn, on the plaza and in the middle of every avenue", () => {
    expect(hidden(SPAWN.x, SPAWN.z)).toBe(false);
    for (const [x, z] of [[6, 8], [-6, 3], [0, 15], [-14, -6]]) expect(hidden(x, z), `(${x}, ${z})`).toBe(false);
    // Behind one of the small pines of the plaza it is hidden: they count too.
    expect(hidden(10, 7.5)).toBe(true);
    for (const node of PATH_GRAPH.nodes.filter((n) => /^avenue-\d+-plaza$/.test(n.id))) expect(hidden(node.x, node.z), node.id).toBe(false);
  });

  it("is hidden right behind the tree, and seen again a few steps farther north", () => {
    // The boughs reach 4.5 u from the axis and the tree is 14 u tall: the camera's line comes down over it.
    expect(hidden(0, -6)).toBe(true);
    expect(hidden(0, -9)).toBe(true);
    expect(hidden(0, -16)).toBe(false);
    // Beside the tree, and in front of it.
    expect(hidden(9, -2)).toBe(false);
    expect(hidden(0, 8)).toBe(false);
  });

  it("is hidden on the street behind a row seen from its back, and not on the same street beside a lane", () => {
    // South side: the economy cottages stand between the camera and their own street.
    const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-19")!;
    expect(plot.front.z).toBeGreaterThan(60);
    expect(hidden(plot.front.x, plot.front.z)).toBe(true);
    // The lane of that side is a gap in the row: seen.
    const lane = PATH_GRAPH.nodes.find((n) => n.id === "lane-03-street-3")!;
    expect(hidden(lane.x, lane.z)).toBe(false);
    // North side: the same row is behind the avatar, and hides nothing.
    const north = RESIDENTIAL_PLOTS.find((p) => p.tier === "economy" && p.front.z < -60 && Math.abs(p.front.x) < 12)!;
    expect(hidden(north.front.x, north.front.z)).toBe(false);
  });

  it("is hidden behind a shop seen from its back, and seen at the door of a shop seen from its front", () => {
    const south = SHOPS.find((s) => s.z > 20)!, north = SHOPS.find((s) => s.z < -20)!;
    expect(hidden(south.door.x, south.door.z)).toBe(true);
    expect(hidden(north.door.x, north.door.z)).toBe(false);
  });

  it("counts the chest and the head, never the feet alone", () => {
    // 4.4 u north of a south-side cottage's north wall the line to the feet still crosses the roof, the lines to
    // the chest and the head pass over the ridge.
    const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-19")!;
    let feetOnly = 0;
    for (let d = 0; d <= 8; d += 0.25) {
      const x = plot.house.x, z = plot.house.z - 2.5 - d;
      const feet = segmentBlocked(OCCLUDERS, x, 25, z + 21, x, 0.15, z);
      const chest = segmentBlocked(OCCLUDERS, x, 25, z + 21, x, AVATAR_CHEST, z), head = segmentBlocked(OCCLUDERS, x, 25, z + 21, x, AVATAR_HEAD, z);
      if (feet && !chest && !head) {
        feetOnly++;
        expect(hidden(x, z), `(${x}, ${z})`).toBe(false);
      }
      expect(hidden(x, z)).toBe(chest || head);
    }
    expect(feetOnly).toBeGreaterThan(0);
  });

  it("follows the camera: zoomed all the way out, the line is the same line, longer", () => {
    for (const [x, z] of [[0, -6], [23.72, 66.5], [14.56, 6.03]]) expect(avatarHidden(OCCLUDERS, x, 1 + 24 * 1.6, z + 21 * 1.6, x, z)).toBe(hidden(x, z));
  });

  it("costs little: every street point of the review in a few milliseconds", () => {
    const points = PATH_GRAPH.edges.flatMap((e) => {
      const a = PATH_GRAPH.nodes.find((n) => n.id === e.a)!, b = PATH_GRAPH.nodes.find((n) => n.id === e.b)!;
      return Array.from({ length: 12 }, (_, i) => [a.x + ((b.x - a.x) * i) / 12, a.z + ((b.z - a.z) * i) / 12]);
    });
    expect(points.length).toBe(1440);
    const t = performance.now();
    let on = 0;
    for (const [x, z] of points) if (hidden(x, z)) on++;
    // About 3 ms on the machine of the review; the bound only catches a change of order of magnitude.
    expect(performance.now() - t).toBeLessThan(250);
    // Hidden on a minority of the street points (the review measured 17 % with rays in the scene).
    expect(on / points.length).toBeGreaterThan(0.1);
    expect(on / points.length).toBeLessThan(0.25);
  });
});

describe("the hold of the see-through drawing", () => {
  /**
   * The drawing frame by frame, as `Player` keeps it: `hiddenAt(t)` is what the look answers at `t` ms, and
   * the last instant it answered "hidden" is carried from frame to frame. Returns the instants the drawing
   * changed, as `[t, shown]`.
   */
  function run(fps: number, until: number, hiddenAt: (t: number) => boolean): Array<[number, boolean]> {
    const changes: Array<[number, boolean]> = [];
    let lastHidden = -Infinity, shown = false;
    for (let frame = 0; (frame * 1000) / fps <= until; frame++) {
      const t = (frame * 1000) / fps;
      const hidden = hiddenAt(t);
      if (hidden) lastHidden = t;
      const next = seeThroughShown(hidden, t, lastHidden);
      if (next !== shown) changes.push([t, (shown = next)]);
    }
    return changes;
  }
  /** Walking past a row: hidden behind each chalet, in plain view for 100 ms in each of the six gaps. */
  const row = (t: number) => t >= 1000 && t < 8000 && (t - 1000) % 1000 < 900;

  it("is about a quarter of a second", () => {
    expect(SEE_THROUGH_HOLD).toBeGreaterThanOrEqual(200);
    expect(SEE_THROUGH_HOLD).toBeLessThanOrEqual(300);
  });

  it("appears at once when the avatar becomes hidden, with no delay at all", () => {
    expect(seeThroughShown(true, 5000, -Infinity)).toBe(true);
    expect(seeThroughShown(true, 5000, 5000)).toBe(true);
    expect(seeThroughShown(true, 5000, 0, 0)).toBe(true);
  });

  it("stays for the hold after the avatar is seen again, and not longer", () => {
    expect(seeThroughShown(false, 1000, 1000)).toBe(true);
    expect(seeThroughShown(false, 1000 + SEE_THROUGH_HOLD - 1, 1000)).toBe(true);
    expect(seeThroughShown(false, 1000 + SEE_THROUGH_HOLD, 1000)).toBe(false);
    expect(seeThroughShown(false, 60_000, 1000)).toBe(false);
    // Another hold, for whoever asks for one.
    expect(seeThroughShown(false, 1040, 1000, 50)).toBe(true);
    expect(seeThroughShown(false, 1050, 1000, 50)).toBe(false);
  });

  it("is never shown for an avatar that was never hidden", () => {
    expect(seeThroughShown(false, 0, -Infinity)).toBe(false);
    expect(seeThroughShown(false, 100, -Infinity)).toBe(false);
    expect(run(60, 3000, () => false)).toEqual([]);
  });

  it.each([24, 30, 60, 120, 144])("does not blink in the gaps of a row at %i frames a second: on once, off once", (fps) => {
    const changes = run(fps, 10_000, row);
    expect(changes.map(([, shown]) => shown)).toEqual([true, false]);
    const frame = 1000 / fps;
    // On with the first frame that finds the avatar hidden…
    expect(changes[0][0]).toBeGreaterThanOrEqual(1000);
    expect(changes[0][0]).toBeLessThan(1000 + frame);
    // …and off one hold after the last frame that did (the row ends at 7 900 ms), whatever the frame rate.
    expect(changes[1][0]).toBeGreaterThanOrEqual(7900 - frame + SEE_THROUGH_HOLD);
    expect(changes[1][0]).toBeLessThan(7900 + SEE_THROUGH_HOLD + frame);
  });

  it("without the hold the same walk blinks: 14 changes, six spells off of a tenth of a second", () => {
    // What the review measured on one street, here as the reason the hold exists.
    const raw: boolean[] = [];
    for (let t = 0; t <= 10_000; t += 1000 / 60) raw.push(seeThroughShown(row(t), t, -Infinity, 0));
    expect(raw.filter((shown, i) => i > 0 && shown !== raw[i - 1])).toHaveLength(14);
  });

  it("lets go when the avatar stays in view for longer than the hold", () => {
    // Two rows with a lane of 400 ms between them: the drawing goes off in the lane and comes back at once.
    const changes = run(60, 4000, (t) => (t >= 500 && t < 1500) || (t >= 1900 && t < 3000));
    expect(changes.map(([, shown]) => shown)).toEqual([true, false, true, false]);
    expect(changes[1][0]).toBeGreaterThanOrEqual(1500 - 1000 / 60 + SEE_THROUGH_HOLD);
    expect(changes[2][0]).toBeLessThan(1900 + 1000 / 60);
  });
});

describe("the look-at-the-sky camera", () => {
  const OFFSETS: Offset[] = [{ x: 0, y: 2.6, z: 10 }, { x: 0, y: 5.5, z: 10 }, { x: 0, y: 8.5, z: 10 }, { x: 0, y: 11.5, z: 10 }, { x: 0, y: 14.5, z: 7 }];
  const LOOK = { x: 0, y: 30, z: -40 };
  const pick = (x: number, z: number) => clearSkyOffset(BUILDINGS, x, z, OFFSETS, LOOK);
  /** The view of an offset is clear: the same rays the picker looks along. */
  const clear = (x: number, z: number, o: Offset) => clearSkyOffset(BUILDINGS, x, z, [o, { x: 0, y: -99, z: 0 }], LOOK) === o;

  it("keeps the usual low view in the open: the spawn and the plaza", () => {
    for (const [x, z] of [[SPAWN.x, SPAWN.z], [-3, 6], [6, 8], [0, 15], [0, -12]]) expect(pick(x, z), `(${x}, ${z})`).toBe(OFFSETS[0]);
    for (const node of PATH_GRAPH.nodes.filter((n) => /^avenue-\d+-plaza$/.test(n.id))) expect(pick(node.x, node.z), node.id).toBe(OFFSETS[0]);
  });

  it("rises over the roofs at the three street points of the review, where the low view was blocked", () => {
    // North economy street, east premium street, south standard street: a chalet stands 10 u south of each.
    for (const [x, z] of [[0, -66.5], [37.5, 6], [-10, 53]]) {
      expect(clear(x, z, OFFSETS[0]), `low view at (${x}, ${z})`).toBe(false);
      const chosen = pick(x, z);
      expect(chosen, `(${x}, ${z})`).not.toBe(OFFSETS[0]);
      expect(clear(x, z, chosen), `chosen view at (${x}, ${z})`).toBe(true);
    }
  });

  it("takes the last, highest position when none is clear, never the first", () => {
    // A solid block 40 u tall right where every position of the camera would be: no view is clear.
    const block: Array<readonly [number, number, number]> = [];
    for (let x = -4; x <= 4; x++) for (let z = 4; z <= 13; z++) for (let y = 0; y < 40; y++) block.push([x, y, z]);
    const boxedIn = [occluderAt(columnsOf(block, 1), { x: 0, z: 0 })];
    for (const o of OFFSETS) expect(clearSkyOffset(boxedIn, 0, 0, [o, { x: 0, y: -99, z: 0 }], LOOK), `offset ${o.y}`).not.toBe(o);
    expect(clearSkyOffset(boxedIn, 0, 0, OFFSETS, LOOK)).toBe(OFFSETS[OFFSETS.length - 1]);
    // The same block somewhere else is nobody's business: the low view is kept.
    expect(clearSkyOffset(boxedIn, 60, 60, OFFSETS, LOOK)).toBe(OFFSETS[0]);
    // One position to choose from: that one, clear or not.
    expect(clearSkyOffset(boxedIn, 0, 0, [OFFSETS[1]], LOOK)).toBe(OFFSETS[1]);
  });

  it("finds a clear view from every point of every street, lane and avenue", () => {
    let raised = 0, n = 0;
    for (const e of PATH_GRAPH.edges) {
      const a = PATH_GRAPH.nodes.find((node) => node.id === e.a)!, b = PATH_GRAPH.nodes.find((node) => node.id === e.b)!;
      for (let i = 0; i <= 12; i++) {
        const x = a.x + ((b.x - a.x) * i) / 12, z = a.z + ((b.z - a.z) * i) / 12;
        const chosen = pick(x, z);
        n++;
        if (chosen !== OFFSETS[0]) raised++;
        expect(clear(x, z, chosen), `${e.a} → ${e.b} at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(true);
      }
    }
    // Raised where a row or a shop stands in the picture, kept low elsewhere.
    expect(raised).toBeGreaterThan(n * 0.2);
    expect(raised).toBeLessThan(n);
  });
});
