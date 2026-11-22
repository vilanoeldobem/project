/**
 * The unified story catalog (PROPOSTA): book-00 postgame, the ten books, the v1 epilogue and the quick
 * missions. The four state functions receive the catalog; no fixed singleton is imported by callers.
 * `V1_CATALOG` is the exact v1 behavior used by defaults and tests.
 */
import { MISSIONS } from "../progress";
import { QUESTS } from "../quests";
import * as B00 from "./books/book-00-epilogue";
import * as B01 from "./books/book-01";
import * as B02 from "./books/book-02";
import * as B03 from "./books/book-03";
import * as B04 from "./books/book-04";
import * as B05 from "./books/book-05";
import * as B06 from "./books/book-06";
import * as B07 from "./books/book-07";
import * as B08 from "./books/book-08";
import * as B09 from "./books/book-09";
import * as B10 from "./books/book-10";
import { MINIGAMES } from "./minigames";
import type { CatalogQuest, StoryCatalog, StoryQuest } from "./types";

const BOOKS = [B01, B02, B03, B04, B05, B06, B07, B08, B09, B10] as const;

export const V1_CATALOG: StoryCatalog = {
  quests: QUESTS,
  milestones: [],
  minigames: MINIGAMES,
  quickMissions: MISSIONS,
};

export const STORY_CATALOG: StoryCatalog = {
  quests: [...BOOKS.flatMap((book) => book.QUESTS), ...QUESTS, ...B00.QUESTS],
  milestones: [...BOOKS.flatMap((book) => book.MILESTONES), ...B00.MILESTONES],
  minigames: MINIGAMES,
  quickMissions: MISSIONS,
};

export { activeInventoryIn, activeQuestIn, applyEventIn, canAcceptIn, prerequisitesOf, questProgressIn, questStateIn } from "./engine";

export const isStoryQuest = (q: CatalogQuest): q is StoryQuest => "book" in q;

/** The catalog visible to a page with each flag: v1 off hides the epilogue, v2 off hides the books. */
export function catalogFor(v1: boolean, v2: boolean): StoryCatalog {
  return {
    quests: [...(v2 ? STORY_CATALOG.quests.filter(isStoryQuest) : []), ...(v1 ? QUESTS : [])],
    milestones: v2 ? STORY_CATALOG.milestones : [],
    minigames: MINIGAMES,
    quickMissions: MISSIONS,
  };
}

export const STORY_QUEST_IDS: ReadonlySet<string> = new Set(STORY_CATALOG.quests.map((q) => q.id));
export const STORY_ENTRY_IDS: ReadonlySet<string> = new Set([...STORY_QUEST_IDS, ...MISSIONS.map((m) => m.id)]);
