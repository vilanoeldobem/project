/**
 * Cosmetic voxel layers for the v2 catalogue (PROPOSTA). Each book slice fills its own module with the six
 * layers; the avatar and the wardrobe use this aggregate. A layer is in avatar coordinates and targets the
 * body or one arm.
 */
import type { GenModel } from "./types";
import { MODELS as B00 } from "./cosmetics/book-00";
import { MODELS as B01 } from "./cosmetics/book-01";
import { MODELS as B02 } from "./cosmetics/book-02";
import { MODELS as B03 } from "./cosmetics/book-03";
import { MODELS as B04 } from "./cosmetics/book-04";
import { MODELS as B05 } from "./cosmetics/book-05";
import { MODELS as B06 } from "./cosmetics/book-06";
import { MODELS as B07 } from "./cosmetics/book-07";
import { MODELS as B08 } from "./cosmetics/book-08";
import { MODELS as B09 } from "./cosmetics/book-09";
import { MODELS as B10 } from "./cosmetics/book-10";

export interface CosmeticModel {
  id: string;
  target: "body" | "armLeft" | "armRight";
  layer: GenModel;
}

export const COSMETIC_MODELS_V2: readonly CosmeticModel[] = [
  ...B00,
  ...B01,
  ...B02,
  ...B03,
  ...B04,
  ...B05,
  ...B06,
  ...B07,
  ...B08,
  ...B09,
  ...B10,
];

const BY_ID = new Map(COSMETIC_MODELS_V2.map((model) => [model.id, model]));

export const cosmeticLayerV2 = (id: string): GenModel | null => BY_ID.get(id)?.layer ?? null;

export const cosmeticTargetV2 = (id: string): CosmeticModel["target"] => BY_ID.get(id)?.target ?? "body";
