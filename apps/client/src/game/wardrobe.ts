/**
 * Which appearance categories each shop's provador shows (P08/IMPL-0027). The mapping is by the positional
 * shop id: `shop-01` is the Ateliê de Enfeites, `shop-02` the Oficina de Brinquedos, `shop-03` the Alfaiataria
 * de Inverno and `shop-04` the Empório da Lareira. A plan that renumbers the shops must update this table
 * (the test in `wardrobe.test.ts` checks the keys against `SHOPS`).
 */
import { SLOTS, type Slot } from "@vila/shared/game/cosmetics";

export const SHOP_SLOTS: Record<string, readonly Slot[]> = {
  "shop-01": ["helmet", "back", "face"],
  "shop-02": ["handLeft", "handRight"],
  "shop-03": ["blouse", "pants", "dress", "shoes"],
  "shop-04": ["special"],
};

/** The categories of one shop; an unknown id (a test or a future shop) shows the whole catalogue. */
export const shopSlots = (shopId: string): readonly Slot[] => SHOP_SLOTS[shopId] ?? SLOTS;
