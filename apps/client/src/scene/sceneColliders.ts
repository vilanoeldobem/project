/**
 * What blocks the avatar and what can hide it, for the scene as it is drawn (IMPL-0016, IMPL-0024). Pure and
 * tested: `Player` walks around `sceneColliders`, and `colliders.test.ts` audits that very list against the
 * voxels the scene draws, so a collider left out here (the chalets of the residential plots, say) fails a unit
 * test instead of letting the avatar walk through a house.
 */
import type { Collider } from "@vila/shared/game/collision";
import { asNgoLevel, type NgoLevel } from "@vila/shared/game/ngo-level";
import { HOUSE_ENVELOPE, lotColliders, LOTS, OBSTACLES, pineAt, pineIsTall, PINES, plotColliders, QUEST_OBSTACLES, RESIDENTIAL_PLOTS, SHOPS, SITE_PROPS, SITES, WORLD_RADIUS } from "@vila/shared/game/world";
import { STORY_WORLD } from "@vila/shared/game/quests-v2/world";

import { civic } from "./gen/civic";
import { ngoBuilding } from "./gen/ngoBuilding";
import { shop } from "./gen/shops";
import { pine, tree } from "./models";
import { type Columns, columnsOf, type Occluder, occluderAt } from "./occlusion";
import { bandstand, billboardFrame, residence } from "./villageModels";

/**
 * The lots with a published house: their ids, or their ids with the level of each building (IMPL-0032). A plain
 * set of ids means every building at level 1, which is what the API answers while the levels are off.
 */
export type Houses = ReadonlySet<string> | ReadonlyMap<string, NgoLevel>;
const levelIn = (houses: Houses, lotId: string): NgoLevel => (houses instanceof Map ? ((houses as ReadonlyMap<string, NgoLevel>).get(lotId) ?? 1) : 1);

/** The published lots as the scene's key for them (`World`): `plaza-03:2,ring1-01:5`. */
export const housesKey = (lots: ReadonlyArray<{ id: string; level: NgoLevel }>): string => lots.map((l) => `${l.id}:${l.level}`).join();
/** Reads `housesKey` back. */
export function housesOf(key: string): Map<string, NgoLevel> {
  return new Map(key.split(",").filter(Boolean).map((entry) => {
    const [id, level] = entry.split(":");
    return [id, asNgoLevel(Number(level))];
  }));
}

/**
 * Walls and porch of the chalet of every residential plot: the footprint of the very model `Residences`
 * draws. Static, so built once.
 */
export const HOME_COLLIDERS: Collider[] = RESIDENTIAL_PLOTS.flatMap((plot) => plotColliders(plot, residence(plot).solid ?? null));

/**
 * Every collider of the scene: the static obstacles, the quest NPCs and the lectern while quests are on
 * (PROPOSTA quests-v1), each lot (the walls and porch of a published chalet, from the footprint of the very
 * model `Lots` draws; otherwise the corner posts and the sign of its marker) and the residential chalets.
 */
export function sceneColliders(published: Houses, quests: boolean, story = false, storyNpcs?: ReadonlySet<string>): Collider[] {
  const storyObstacles = story
    ? STORY_WORLD.obstacles.filter((_, i) => !storyNpcs || storyNpcs.has(STORY_WORLD.npcs[i].id))
    : [];
  return [
    ...OBSTACLES,
    ...(quests ? QUEST_OBSTACLES : []),
    ...storyObstacles,
    ...LOTS.flatMap((lot) => lotColliders(lot, published.has(lot.id) ? (ngoBuilding(lot.id, levelIn(published, lot.id)).solid ?? HOUSE_ENVELOPE) : null)),
    ...HOME_COLLIDERS,
  ];
}

const columns = new Map<string, Columns>();
/** Column map of a model, built once per key (copies of a model share it; a seeded model is keyed by its seed). */
const columnsFor = (key: string, model: () => { voxels: Parameters<typeof columnsOf>[0]; size: number }): Columns => {
  let c = columns.get(key);
  if (!c) {
    const m = model();
    columns.set(key, (c = columnsOf(m.voxels, m.size)));
  }
  return c;
};

/** The tree and the pines inside the walkable village (and just beyond its edge). */
let plants: Occluder[] | null = null;
const plantOccluders = (): Occluder[] =>
  (plants ??= [
    occluderAt(columnsFor("tree", () => ({ voxels: tree(), size: 1 })), { x: 0, z: 0 }),
    ...PINES.map((p, i) => ({ at: pineAt(p), tall: pineIsTall(i) }))
      .filter(({ at }) => Math.hypot(at.x, at.z) < WORLD_RADIUS + 12)
      .map(({ at, tall }) => occluderAt(columnsFor(`pine:${tall}`, () => ({ voxels: pine(tall), size: 1 })), at)),
  ]);

/** The buildings that are always drawn: the shops with their sign frames, the residential chalets, the civic buildings and the bandstands. */
let fixed: Occluder[] | null = null;
const fixedBuildings = (): Occluder[] =>
  (fixed ??= [
    ...SHOPS.flatMap((s) => [
      occluderAt(columnsFor(`shop:${s.id}`, () => shop(s.id)), { x: s.x, z: s.z, rot: s.facing }),
      occluderAt(columnsFor("frame", () => ({ voxels: billboardFrame(), size: 1 })), { x: s.x, z: s.z }),
    ]),
    ...RESIDENTIAL_PLOTS.map((plot) => occluderAt(columnsFor(`home:${plot.id}`, () => residence(plot)), { x: plot.house.x, z: plot.house.z, rot: plot.facing })),
    // The rings (IMPL-0031): the civic buildings and the bandstands of the parks hide the avatar like any building.
    ...SITES.filter((site) => site.kind).map((site) => occluderAt(columnsFor(`site:${site.id}`, () => civic(site.kind!, site.id)), { x: site.centre.x, z: site.centre.z, rot: site.facing })),
    ...SITE_PROPS.filter((prop) => prop.kind === "bandstand").map((prop) => occluderAt(columnsFor("bandstand", () => ({ voxels: bandstand(), size: 1 })), prop)),
  ]);

/** Every building of the scene: the fixed ones and the chalet of every published lot. */
export function sceneBuildings(published: Houses): Occluder[] {
  return [
    ...fixedBuildings(),
    ...LOTS.filter((lot) => published.has(lot.id)).map((lot) => {
      const level = levelIn(published, lot.id);
      return occluderAt(columnsFor(`house:${lot.id}:${level}`, () => ngoBuilding(lot.id, level)), { x: lot.x, z: lot.z, rot: lot.facing });
    }),
  ];
}

/**
 * What can stand between the camera and the avatar (`occlusion.ts`): the buildings, the tree and the pines.
 * Lamp posts, fences, stalls, the sleigh and villagers are thin or low: they may cover the avatar's legs, or
 * its chest for a step, and are left out.
 */
export function sceneOccluders(published: Houses): Occluder[] {
  return [...plantOccluders(), ...sceneBuildings(published)];
}
