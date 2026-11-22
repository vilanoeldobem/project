/** Every content generator, by category (IMPL-0010). The gallery and the tests iterate this list. */
import { ANIMALS } from "./animals";
import { CHARACTERS } from "./characters";
import { CIVIC_GENERATORS } from "./civic";
import { COSMETIC_LAYERS } from "./cosmetics";
import { HOUSES } from "./houses";
import { NGO_BUILDINGS } from "./ngoBuilding";
import { PROPS } from "./props";
import { QUEST_ITEMS } from "./quest-items";
import { STORY_PROP_GENERATORS } from "./quest-v2/catalog";
import { SHOPS } from "./shops";
import type { Category, Generator } from "./types";

export const GENERATORS: Generator[] = [
  ...PROPS,
  ...QUEST_ITEMS,
  ...STORY_PROP_GENERATORS.map((g): Generator => ({ id: g.id, category: "props", name: g.name, generate: (seed) => g.generate(String(seed)) })),
  ...HOUSES,
  ...NGO_BUILDINGS,
  ...SHOPS,
  ...CIVIC_GENERATORS,
  ...CHARACTERS,
  ...ANIMALS,
  ...COSMETIC_LAYERS,
];

export const byCategory = (c: Category) => GENERATORS.filter((g) => g.category === c);
