/** Every content generator, by category (IMPL-0010). The gallery and the tests iterate this list. */
import { PROPS } from "./props";
import type { Category, Generator } from "./types";

export const GENERATORS: Generator[] = [...PROPS];

export const byCategory = (c: Category) => GENERATORS.filter((g) => g.category === c);
