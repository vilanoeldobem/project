import type { Voxel } from "../models";
import type { Seed } from "./rng";

export type Category = "props" | "houses" | "characters" | "animals" | "cosmetics";

/** A generated model, ready for `<Voxels>` (roles by colour, like the hand-made models). */
export interface GenModel {
  voxels: Voxel[];
  /** Edge length of one voxel in world units. */
  size: number;
  emissive?: string[];
  glow?: string[];
  sway?: string[];
  /** Named points in voxel units (e.g. chimney top for smoke). */
  anchors?: Record<string, [number, number, number]>;
}

export interface Generator {
  id: string;
  category: Category;
  /** Short pt-BR name for the dev gallery (never shown as a label in the village). */
  name: string;
  generate: (seed: Seed) => GenModel;
}
