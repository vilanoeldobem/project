/** Every v2 cosmetic model is unique and resolves through the aggregate; v1 ids stay with the v1 models. */
import { describe, expect, it } from "vitest";

import { COSMETIC_MODELS_V2, cosmeticLayerV2, cosmeticTargetV2 } from "./cosmetics-v2";
import { itemVoxels } from "./cosmetics";

describe("cosmetic v2 models", () => {
  it("has unique ids and a layer for every v2 model", () => {
    expect(new Set(COSMETIC_MODELS_V2.map((model) => model.id)).size).toBe(COSMETIC_MODELS_V2.length);
    for (const model of COSMETIC_MODELS_V2) {
      expect(cosmeticLayerV2(model.id)).toBe(model.layer);
      expect(["body", "armLeft", "armRight"]).toContain(cosmeticTargetV2(model.id));
    }
  });

  it("leaves v1 ids to the v1 model functions", () => {
    expect(cosmeticLayerV2("helmet-santa")).toBeNull();
    expect(itemVoxels("helmet-santa")).not.toBeNull();
  });
});
