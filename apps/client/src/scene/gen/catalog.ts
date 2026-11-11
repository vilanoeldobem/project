/** Every content generator, by category (IMPL-0010). The gallery and the tests iterate this list. */
import { ANIMALS } from "./animals";
import { CHARACTERS } from "./characters";
import { HOUSES } from "./houses";
import { PROPS } from "./props";
import type { Category, Generator } from "./types";

export const GENERATORS: Generator[] = [...PROPS, ...HOUSES, ...CHARACTERS, ...ANIMALS];

export const byCategory = (c: Category) => GENERATORS.filter((g) => g.category === c);
