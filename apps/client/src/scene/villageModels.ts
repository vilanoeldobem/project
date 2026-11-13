/**
 * Voxel models of the expanded village (IMPL-0023, PROPOSTA) that are not seeded generators: the dressing of
 * the residential rows (what tells the tiers apart) and the billboard frame. Pure, like `models.ts`: the
 * scene draws them and `colliders.test.ts` checks them against the footprints in the shared world.
 */
import type { Placed } from "@vila/shared/game/collision";
import { DRESSING_VOXEL, type DressingKind, type DressingPart, PALETTE as P, type ResidentialPlot, VILLAGE_PLAN } from "@vila/shared/game/world";

import { house } from "./gen/houses";
import { V } from "./gen/palette";
import type { GenModel } from "./gen/types";
import type { Voxel } from "./models";

const residences = new Map<string, GenModel>();

/**
 * The chalet drawn on a residential plot: seeded by the plot id, with the footprint of its tier. Decor: nobody
 * holds a plot yet (ownership is off, OQ-16). Generated once per plot (the scene and the colliders share it).
 */
export function residence(plot: Pick<ResidentialPlot, "id" | "tier">): GenModel {
  let model = residences.get(plot.id);
  if (!model) {
    const { halfWidth, halfDepth, porch, eaves } = VILLAGE_PLAN.tiers[plot.tier].house;
    const drawn = house(plot.id, { halfWidth, halfDepth, porch, eaves, low: true, ridgeAlongStreet: true });
    residences.set(plot.id, (model = { ...drawn, voxels: fillInterior(drawn.voxels, halfWidth, halfDepth) }));
  }
  return model;
}

/**
 * Fills a chalet under its roof. Nobody goes inside, and a filled cell has no visible face while it hides
 * the inner face of every wall, window and roof voxel around it: the 112 chalets cost about a third fewer
 * triangles and look the same.
 */
export function fillInterior(voxels: readonly Voxel[], halfWidth: number, halfDepth: number): Voxel[] {
  const lowest = new Map<string, number>();
  for (const [x, y, z] of voxels) {
    if (Math.abs(x) >= halfWidth || Math.abs(z) >= halfDepth) continue;
    const k = `${x},${z}`;
    lowest.set(k, Math.min(lowest.get(k) ?? Infinity, y));
  }
  const out = [...voxels];
  for (let x = -halfWidth + 1; x < halfWidth; x++)
    for (let z = -halfDepth + 1; z < halfDepth; z++) {
      const roof = lowest.get(`${x},${z}`);
      if (roof === undefined) continue; // no roof over this cell: leave it open rather than draw a pillar
      for (let y = 0; y < roof; y++) out.push([x, y, z, P.wood]);
    }
  return out;
}

/**
 * Top of a chalet's chimney in the world: the model's `chimney` anchor turned and moved with the chalet.
 * Smoke starts here (`Smoke`); a later phase lights it per fireplace.
 */
export function chimneyOf(model: GenModel, at: Required<Placed>): [number, number, number] {
  const [cx, cy, cz] = model.anchors?.chimney ?? [0, 6, 0];
  const c = Math.cos(at.rot), s = Math.sin(at.rot);
  return [at.x + (cx * c + cz * s) * model.size, cy * model.size, at.z + (-cx * s + cz * c) * model.size];
}

const mottle = (x: number, y: number, z: number, a: string, b: string) => ((x * 7 + y * 3 + z * 5) % 3 === 0 ? b : a);

/**
 * One dressing part, in voxels of `DRESSING_VOXEL`: `length` voxels along +x from the origin and `thick`
 * across (+z). Colours that glow are in `DRESSING_GLOW`.
 */
export function dressingModel(kind: DressingKind, length: number, thick: number): Voxel[] {
  const v: Voxel[] = [];
  const each = (f: (x: number, z: number) => void) => {
    for (let x = 0; x < length; x++) for (let z = 0; z < thick; z++) f(x, z);
  };
  switch (kind) {
    case "stone-wall":
      each((x, z) => {
        v.push([x, 0, z, P.stoneDark], [x, 1, z, (x + z) % 2 ? P.stone : V.stoneWarm]);
        if (x % 3 !== 1) v.push([x, 2, z, P.snow]);
      });
      break;
    case "gate-pillar":
      each((x, z) => v.push([x, 0, z, P.stoneDark], [x, 1, z, P.stone], [x, 2, z, P.stone], [x, 3, z, P.stoneDark], [x, 4, z, P.gold], [x, 5, z, P.coal], [x, 6, z, P.snow]));
      break;
    case "shrub":
      each((x, z) => {
        const edge = (x === 0 || x === length - 1) && (z === 0 || z === thick - 1);
        v.push([x, 0, z, mottle(x, 0, z, P.pineDark, P.pineLight)]);
        if (!edge) v.push([x, 1, z, mottle(x, 1, z, P.pineLight, P.red)]);
        if (x === 1 && z === 1) v.push([x, 2, z, P.snow]);
      });
      break;
    case "picket":
      each((x, z) => {
        const post = x === 0 || x === length - 1;
        v.push([x, 0, z, P.cream], [x, 1, z, P.cream]);
        if (post) v.push([x, 2, z, P.cream], [x, 3, z, P.snow]);
        else if (x % 2) v.push([x, 2, z, V.creamShade]);
      });
      break;
    case "hedge":
      each((x, z) => {
        for (let y = 0; y < 3; y++) v.push([x, y, z, mottle(x, y, z, P.pineDark, P.pineLight)]);
        if ((x * 3 + z * 5) % 4 !== 0) v.push([x, 3, z, P.snow]);
      });
      break;
    case "stake":
      each((x, z) => v.push([x, 0, z, P.trunk], [x, 1, z, P.trunk], [x, 2, z, P.trunk], [x, 3, z, P.gold], [x, 4, z, P.snow]));
      break;
    case "firewood":
      each((x, z) => {
        v.push([x, 0, z, z % 2 ? P.trunk : P.wood], [x, 1, z, z % 2 ? V.woodDark : P.trunk]);
        if ((x + z) % 3 === 0) v.push([x, 2, z, P.snow]);
      });
      break;
  }
  return v;
}

/** Colours of the dressing that glow like the plaza lanterns (the lights role). */
export const DRESSING_GLOW = [P.gold];

/** Distinct dressing models of a set of parts, each with the placements of its copies. */
export function dressingItems(parts: readonly DressingPart[]): Array<{ voxels: Voxel[]; size: number; emissive: string[]; placements: Array<Required<Placed>> }> {
  const byModel = new Map<string, { voxels: Voxel[]; size: number; emissive: string[]; placements: Array<Required<Placed>> }>();
  for (const part of parts) {
    const key = `${part.kind}:${part.length}:${part.thick}`;
    let item = byModel.get(key);
    if (!item) byModel.set(key, (item = { voxels: dressingModel(part.kind, part.length, part.thick), size: DRESSING_VOXEL, emissive: DRESSING_GLOW, placements: [] }));
    item.placements.push({ x: part.x, z: part.z, rot: part.rot });
  }
  return [...byModel.values()];
}

/** Billboard frame (draw with size 1, never turned: it faces +z, towards the camera). The panel is 5 × 2 u, centred on y = 8. */
export const BILLBOARD_PANEL = { width: 5, height: 2 } as const;
export function billboardFrame(): Voxel[] {
  const v: Voxel[] = [];
  for (let x = -3; x <= 3; x++) v.push([x, 6, 0, V.woodDark], [x, 9, 0, V.woodDark]);
  for (const x of [-3, 3]) v.push([x, 7, 0, V.woodDark], [x, 8, 0, V.woodDark]);
  // The board the notice is drawn on (a flat panel just in front of it), blank from behind.
  for (let x = -2; x <= 2; x++) v.push([x, 7, 0, P.cream], [x, 8, 0, P.cream]);
  // Two lamps over the panel and snow along the top bar.
  v.push([-2, 10, 0, P.gold], [2, 10, 0, P.gold]);
  for (const x of [-3, -1, 0, 1, 3]) v.push([x, 10, 0, P.snow]);
  return v;
}
