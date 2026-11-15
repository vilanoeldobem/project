import { describe, expect, it } from "vitest";

import { SLOTS } from "@vila/shared/game/cosmetics";
import { SHOPS } from "@vila/shared/game/world";

import { SHOP_SLOTS, shopSlots } from "./wardrobe";

describe("shop categories (P08)", () => {
  it("maps every shop and covers every category exactly once", () => {
    expect(Object.keys(SHOP_SLOTS).sort()).toEqual(SHOPS.map((s) => s.id).sort());
    const seen = Object.values(SHOP_SLOTS).flat();
    expect(seen.sort()).toEqual([...SLOTS].sort());
    expect(new Set(seen).size).toBe(SLOTS.length);
  });

  it("falls back to the whole catalogue for an unknown shop", () => {
    expect(shopSlots("shop-99")).toBe(SLOTS);
  });
});
