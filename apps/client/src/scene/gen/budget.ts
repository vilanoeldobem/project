/**
 * Per-category budgets (IMPL-0010), enforced by tests: every variant of every generator must fit, so
 * adding content can never silently blow up triangles or upload size.
 */
import { meshVoxels } from "../mesher";
import type { Voxel } from "../models";
import type { Category } from "./types";

export const BUDGETS: Record<Category, { voxels: number; faces: number }> = {
  props: { voxels: 220, faces: 600 },
  houses: { voxels: 900, faces: 1800 },
  characters: { voxels: 160, faces: 420 },
  animals: { voxels: 140, faces: 380 },
  cosmetics: { voxels: 40, faces: 140 },
};

/** Unique cells and emitted faces (after culling) of a model. */
export function measure(voxels: readonly Voxel[]): { voxels: number; faces: number } {
  const cells = new Set(voxels.map((v) => `${v[0]},${v[1]},${v[2]}`)).size;
  const [m] = meshVoxels(voxels, { toLinear: () => [1, 1, 1] });
  return { voxels: cells, faces: m.faces };
}
