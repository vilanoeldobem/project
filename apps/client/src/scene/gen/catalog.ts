/** Every content generator, by category (IMPL-0010). The gallery and the tests iterate this list. */
import { ANIMALS } from "./animals";
import { CHARACTERS } from "./characters";
import { COSMETIC_LAYERS } from "./cosmetics";
import { HOUSES } from "./houses";
import { PROPS } from "./props";
import { QUEST_ITEMS } from "./quest-items";
import { SHOPS } from "./shops";
import type { Category, Generator } from "./types";

export const GENERATORS: Generator[] = [
  ...PROPS,
  ...QUEST_ITEMS,
  ...HOUSES,
  ...SHOPS,
  ...CHARACTERS,
  ...ANIMALS,
  ...COSMETIC_LAYERS,
];

export const byCategory = (c: Category) => GENERATORS.filter((g) => g.category === c);
