/**
 * Story v2 prop generators (PROPOSTA). Ten book modules plus the saga props; each book slice fills its own
 * folder. `REUSED` keeps the v1 quest-item generators available to book tables that name an existing object.
 */
import type { GenModel } from "../types";
import { lantern as generateLantern } from "../props";
import { donationPanel, ornamentCrate, reindeerBell, storyPage } from "../quest-items";
import { PROPS as B00 } from "./book-00";
import { PROPS as B01 } from "./book-01";
import { PROPS as B02 } from "./book-02";
import { PROPS as B03 } from "./book-03";
import { PROPS as B04 } from "./book-04";
import { PROPS as B05 } from "./book-05";
import { PROPS as B06 } from "./book-06";
import { PROPS as B07 } from "./book-07";
import { PROPS as B08 } from "./book-08";
import { PROPS as B09 } from "./book-09";
import { PROPS as B10 } from "./book-10";
import { PROPS as SAGA_PROPS } from "./saga";

export interface StoryPropGenerator {
  id: string;
  category: "quest_item" | "world_prop";
  name: string;
  generate: (seed: string) => GenModel;
}

export const STORY_PROP_GENERATORS: readonly StoryPropGenerator[] = [
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
  ...SAGA_PROPS,
];

const REUSED: Record<string, (seed: string) => GenModel> = {
  "reindeer-bell": reindeerBell,
  "ornament-crate": ornamentCrate,
  "lake-lantern": generateLantern,
  "story-page": storyPage,
  "donation-panel": donationPanel,
};

const STORY_PROP_BY_ID = new Map(STORY_PROP_GENERATORS.map((generator) => [generator.id, generator.generate]));

export const storyProp = (id: string): GenModel | undefined => {
  const generate = STORY_PROP_BY_ID.get(id) ?? REUSED[id];
  return generate ? generate(id) : undefined;
};
