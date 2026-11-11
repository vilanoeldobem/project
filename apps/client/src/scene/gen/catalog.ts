/** Every content generator, by category (IMPL-0010). The gallery and the tests iterate this list. */
import { HOUSES } from "./houses";
import { PROPS } from "./props";
import type { Category, Generator } from "./types";

export const GENERATORS: Generator[] = [...PROPS, ...HOUSES];

export const byCategory = (c: Category) => GENERATORS.filter((g) => g.category === c);
